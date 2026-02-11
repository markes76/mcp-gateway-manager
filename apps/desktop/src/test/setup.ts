const themeAttributes = new Map<string, string>();

const fakeWindow = {
  matchMedia: (query: string) => ({
    matches: query.includes("dark"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
};

const fakeDocument = {
  documentElement: {
    setAttribute: (name: string, value: string): void => {
      themeAttributes.set(name, value);
    },
    getAttribute: (name: string): string | null => {
      return themeAttributes.get(name) ?? null;
    }
  }
};

Object.defineProperty(globalThis, "window", {
  writable: true,
  value: fakeWindow as unknown as Window
});

Object.defineProperty(globalThis, "document", {
  writable: true,
  value: fakeDocument as unknown as Document
});
