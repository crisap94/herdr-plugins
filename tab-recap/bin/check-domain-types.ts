import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { err, type Result } from '#src/protocol/result.ts';
import { isAssertion, isInlineLiteralUnion, isLibraryContext, isBuiltinObject, isNumericEnum, predicateName } from './domain-syntax.ts';
import { BRAND_FILE } from './domain-exceptions.ts';
import { categoryIn, type Finding } from './domain-findings.ts';
import { runReport } from './domain-ratchet.ts';
import { projectOf, settle, type Report } from './domain-report.ts';

const PARSER_NAME = /^parse([A-Z]\w*)$/;
const PRIMITIVE = ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping | ts.TypeFlags.Number | ts.TypeFlags.BigInt | ts.TypeFlags.Boolean | ts.TypeFlags.ESSymbol | ts.TypeFlags.Any | ts.TypeFlags.NonPrimitive;

type Holder = ts.InterfaceDeclaration | ts.ClassDeclaration | ts.TypeLiteralNode;
type Place = Omit<Finding, 'reason'>;

interface Frame {
    readonly place: Place;
    readonly allowUnknown: boolean;
    readonly seen: Set<ts.Type>;
}

interface Scan {
    readonly checker: ts.TypeChecker;
    readonly root: string;
    readonly markers: ReadonlySet<ts.Symbol>;
    readonly findings: Finding[];
    readonly declared: Set<ts.Node>;
    readonly queue: Holder[];
}

const placeOf = (scan: Scan, node: ts.Node, fields: Omit<Place, 'file' | 'line'>): Place => {
    const file = node.getSourceFile();
    return { ...fields, file: relative(scan.root, file.fileName), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 };
};

const frameOf = (place: Place, allowUnknown: boolean): Frame => ({ place, allowUnknown, seen: new Set() });

const report = (scan: Scan, place: Place, reason: string): void => {
    scan.findings.push({ ...place, category: categoryIn(place.file, place.category), reason });
};

const isPropertyMember = (node: ts.Node): node is ts.PropertySignature | ts.PropertyDeclaration =>
    ts.isPropertySignature(node) || ts.isPropertyDeclaration(node);

const isHolder = (node: ts.Node): node is Holder =>
    ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isTypeLiteralNode(node);

const isNamedNode = (node: ts.Node): node is ts.NamedDeclaration =>
    [ts.isFunctionDeclaration, ts.isMethodDeclaration, ts.isClassDeclaration, ts.isInterfaceDeclaration, ts.isTypeAliasDeclaration, ts.isPropertyDeclaration, ts.isPropertySignature, ts.isMethodSignature, ts.isVariableDeclaration, ts.isTypeParameterDeclaration, ts.isGetAccessorDeclaration, ts.isSetAccessorDeclaration]
        .some((guard) => guard(node));

const ownerName = (node: ts.Node): string => {
    if (ts.isConstructorDeclaration(node)) {
        return ownerName(node.parent);
    }
    if (ts.isVariableDeclaration(node.parent) && (ts.isArrowFunction(node) || ts.isFunctionExpression(node))) {
        return ownerName(node.parent);
    }
    const name = isNamedNode(node) ? node.name : undefined;
    return name === undefined ? '<anonymous>' : name.getText();
};

const enclosingOwner = (node: ts.Node): string => {
    if (ts.isSourceFile(node.parent)) {
        return '<module>';
    }
    return ts.isFunctionLike(node.parent) ? ownerName(node.parent) : enclosingOwner(node.parent);
};

const isMarker = (scan: Scan, declaration: ts.Declaration): boolean => {
    if (!ts.isPropertySignature(declaration) || !ts.isComputedPropertyName(declaration.name)) {
        return false;
    }
    const symbol = scan.checker.getSymbolAtLocation(declaration.name.expression);
    return symbol !== undefined && scan.markers.has(symbol);
};

const isBrand = (scan: Scan, type: ts.Type): boolean =>
    type.isIntersection() &&
    type.types.some((member) =>
        member.getProperties().some((property) => (property.declarations ?? []).some((declaration) => isMarker(scan, declaration))));

const isPrimitive = (type: ts.Type): boolean => (type.flags & PRIMITIVE) !== 0;

const isBareType = (type: ts.Type): boolean =>
    isPrimitive(type) ||
    isBuiltinObject(type) ||
    (type.isIntersection() && type.types.some(isPrimitive));

const isReference = (type: ts.Type): type is ts.TypeReference => {
    const flags = 'objectFlags' in type && typeof type.objectFlags === 'number' ? type.objectFlags : 0;
    return (flags & ts.ObjectFlags.Reference) !== 0;
};

const argumentsOf = (scan: Scan, type: ts.Type): readonly ts.Type[] => [
    ...(type.aliasTypeArguments ?? []),
    ...(isReference(type) ? scan.checker.getTypeArguments(type) : []),
];

const isLiteralType = (type: ts.Type): boolean =>
    ((type.getSymbol()?.flags ?? 0) & (ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.ObjectLiteral)) !== 0;

const enqueue = (scan: Scan, type: ts.Type): void => {
    (type.getSymbol()?.declarations ?? []).forEach((declaration) => {
        if (isHolder(declaration) && !scan.declared.has(declaration) && !declaration.getSourceFile().isDeclarationFile) {
            scan.declared.add(declaration);
            scan.queue.push(declaration);
        }
    });
};

const inspectObject = (scan: Scan, frame: Frame, type: ts.Type, inAlias: boolean): void => {
    const callable = type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0;
    if (!callable && !inAlias && type.aliasSymbol === undefined && isLiteralType(type)) {
        report(scan, frame.place, 'is an anonymous object-literal type; name it and declare it');
    }
    enqueue(scan, type);
};

const forbiddenReason = (scan: Scan, type: ts.Type): string | undefined => {
    if (isNumericEnum(type)) {
        return 'is a numeric enum; use a closed union of string literals or a brand';
    }
    return isBareType(type) ? `resolves to ${scan.checker.typeToString(type)}` : undefined;
};

const inspect = (scan: Scan, frame: Frame, type: ts.Type, inAlias: boolean): void => {
    if (frame.seen.has(type)) {
        return;
    }
    frame.seen.add(type);
    if ((type.flags & ts.TypeFlags.Unknown) !== 0) {
        if (!frame.allowUnknown) {
            report(scan, frame.place, 'is unknown; only a parser or a type guard takes unknown');
        }
        return;
    }
    if (isBrand(scan, type)) {
        return;
    }
    const forbidden = forbiddenReason(scan, type);
    if (forbidden !== undefined) {
        report(scan, frame.place, forbidden);
        return;
    }
    const inner: Frame = { ...frame, allowUnknown: false, place: { ...frame.place, category: 'container' } };
    argumentsOf(scan, type).forEach((argument) => inspect(scan, inner, argument, false));
    if (type.isUnion() || type.isIntersection()) {
        const aliased = inAlias || type.aliasSymbol !== undefined;
        type.types.forEach((member) => inspect(scan, frame, member, aliased));
    } else if ((type.flags & ts.TypeFlags.Object) !== 0) {
        inspectObject(scan, frame, type, inAlias);
    }
};

const namesOf = (statement: ts.Statement): readonly string[] => {
    if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.flatMap((declaration) => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : []));
    }
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement)) {
        return statement.name === undefined ? [] : [statement.name.text];
    }
    return [];
};

const declaresName = (file: ts.SourceFile, name: string): boolean =>
    file.statements.some((statement) => namesOf(statement).includes(name));

const isExported = (node: ts.SignatureDeclaration): boolean => {
    const declaration = ts.isVariableDeclaration(node.parent) ? node.parent : node;
    return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
};

const allowsUnknown = (node: ts.SignatureDeclaration): boolean => {
    const file = node.getSourceFile();
    const domain = PARSER_NAME.exec(ownerName(node))?.[1];
    const guarded = predicateName(node);
    return domain === undefined ? guarded !== undefined && declaresName(file, guarded) : isExported(node) && declaresName(file, domain);
};

const reportInlineUnion = (scan: Scan, annotation: ts.TypeNode | undefined, place: Place): void => {
    if (isInlineLiteralUnion(annotation)) {
        report(scan, place, 'is an inline literal union; name it with a type alias');
    }
};

const checkSignature = (scan: Scan, node: ts.SignatureDeclaration): void => {
    const owner = ownerName(node);
    const unknownParameter = allowsUnknown(node);
    node.parameters.forEach((parameter) => {
        if (parameter.type === undefined && isLibraryContext(scan.checker, node)) {
            return;
        }
        const name = parameter.name.getText();
        const place = placeOf(scan, parameter, { owner, parameter: name, category: 'parameter', site: `parameter ${name}` });
        reportInlineUnion(scan, parameter.type, place);
        inspect(scan, frameOf(place, unknownParameter), scan.checker.getTypeAtLocation(parameter), false);
    });
    const noReturn = ts.isConstructorDeclaration(node) || ts.isSetAccessorDeclaration(node) || (node.type !== undefined && ts.isTypePredicateNode(node.type)) || (node.type === undefined && isLibraryContext(scan.checker, node));
    const signature = noReturn ? undefined : scan.checker.getSignatureFromDeclaration(node);
    if (signature === undefined) {
        return;
    }
    const place = placeOf(scan, node, { owner, parameter: null, category: 'return', site: 'return' });
    reportInlineUnion(scan, node.type, place);
    inspect(scan, frameOf(place, false), scan.checker.getReturnTypeOfSignature(signature), false);
};

const scanNode = (scan: Scan, node: ts.Node): void => {
    if (ts.isFunctionLike(node) && !ts.isIndexSignatureDeclaration(node)) {
        checkSignature(scan, node);
    }
    if (ts.isTypeParameterDeclaration(node) && node.constraint !== undefined) {
        const name = node.name.text;
        const place = placeOf(scan, node, { owner: ownerName(node.parent), parameter: name, category: 'parameter', site: `type parameter ${name}` });
        inspect(scan, frameOf(place, false), scan.checker.getTypeFromTypeNode(node.constraint), false);
    }
    if (isAssertion(node)) {
        const place = placeOf(scan, node, { owner: enclosingOwner(node), parameter: null, category: 'assertion', site: 'type assertion' });
        report(scan, place, `as ${node.type.getText()}`);
    }
};

const scanFile = (scan: Scan, file: ts.SourceFile): void => {
    const visit = (node: ts.Node): void => {
        scanNode(scan, node);
        ts.forEachChild(node, visit);
    };
    visit(file);
};

const checkMembers = (scan: Scan, holder: Holder): void => {
    const owner = ownerName(holder);
    const members: readonly ts.Node[] = holder.members;
    members.filter(isPropertyMember).forEach((member) => {
        const name = member.name.getText();
        const place = placeOf(scan, member, { owner, parameter: null, category: 'property', site: `property ${name}` });
        inspect(scan, frameOf(place, false), scan.checker.getTypeAtLocation(member), false);
    });
};

const markersOf = (checker: ts.TypeChecker, brand: ts.SourceFile | undefined): ReadonlySet<ts.Symbol> => {
    if (brand === undefined) {
        return new Set();
    }
    const declarations = brand.statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations);
    return new Set(declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) && declaration.name.text === 'marker' ? checker.getSymbolAtLocation(declaration.name) ?? [] : []));
};

const check = (configPath: string): Result<Report, string> => {
    const root = dirname(configPath);
    const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
    if (config.error !== undefined) {
        return err(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    }
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
    const checker = program.getTypeChecker();
    const sources = program.getSourceFiles().filter((file) => !file.isDeclarationFile && relative(root, file.fileName).startsWith('src/'));
    if (sources.length === 0) {
        return err(`no file under src/ in ${configPath}`);
    }
    const brand = program.getSourceFiles().find((file) => relative(root, file.fileName) === BRAND_FILE);
    const scan: Scan = { checker, root, markers: markersOf(checker, brand), findings: [], declared: new Set(), queue: [] };
    sources.forEach((file) => scanFile(scan, file));
    for (let holder = scan.queue.pop(); holder !== undefined; holder = scan.queue.pop()) {
        checkMembers(scan, holder);
    }
    return settle(root, scan.findings);
};

const main = (args: readonly string[]): number => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const project = projectOf(args, join(root, 'tsconfig.json'));
    const result = project.kind === 'err' ? project : check(project.value);
    return runReport(root, args, result);
};

if (import.meta.main) {
    process.exitCode = main(process.argv.slice(2));
}
