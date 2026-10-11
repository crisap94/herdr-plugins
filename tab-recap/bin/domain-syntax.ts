import ts from 'typescript';

const isTextOrNumberLiteral = (member: ts.TypeNode): boolean =>
    ts.isLiteralTypeNode(member) && (ts.isStringLiteral(member.literal) || ts.isNumericLiteral(member.literal));

export const isInlineLiteralUnion = (annotation: ts.TypeNode | undefined): boolean =>
    annotation !== undefined && ts.isUnionTypeNode(annotation) && annotation.types.some(isTextOrNumberLiteral);

export const predicateName = (node: ts.SignatureDeclaration): string | undefined => {
    const predicate = node.type;
    const target = predicate !== undefined && ts.isTypePredicateNode(predicate) ? predicate.type : undefined;
    return target !== undefined && ts.isTypeReferenceNode(target) && ts.isIdentifier(target.typeName) ? target.typeName.text : undefined;
};

export const isLibraryContext = (checker: ts.TypeChecker, node: ts.SignatureDeclaration): boolean => {
    if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) {
        return false;
    }
    const declared = checker.getContextualType(node)?.getCallSignatures()[0]?.declaration;
    return declared !== undefined && declared.getSourceFile().isDeclarationFile;
};

export const isAssertion = (node: ts.Node): node is ts.AsExpression | ts.TypeAssertion =>
    ts.isTypeAssertionExpression(node) ||
    (ts.isAsExpression(node) && !(ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const'));

const BUILTIN_OBJECTS: ReadonlySet<string> = new Set(['Object', 'Function', 'Date', 'Buffer']);

export const isNumericEnum = (type: ts.Type): boolean => {
    const members = type.isUnion() ? type.types : [type];
    return (type.flags & ts.TypeFlags.EnumLike) !== 0 && members.some((member) => (member.flags & ts.TypeFlags.NumberLiteral) !== 0);
};

export const isBuiltinObject = (type: ts.Type): boolean => {
    const symbol = type.getSymbol();
    return symbol !== undefined && BUILTIN_OBJECTS.has(symbol.getName()) && (symbol.declarations ?? []).some((declaration) => declaration.getSourceFile().isDeclarationFile);
};
