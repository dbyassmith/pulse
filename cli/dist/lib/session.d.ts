export declare const fileStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};
export declare function deleteSessionFile(): void;
