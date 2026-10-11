export function answerHandoff(db: { exec(sql: string): void }): void {
    db.exec('BEGIN');
}
