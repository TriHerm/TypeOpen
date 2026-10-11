export {}

declare global {
  interface TypeOpenTreeNode {
    type: 'file' | 'directory'
    name: string
    path: string
    modifiedAt?: number
    children?: TypeOpenTreeNode[]
  }

  interface TypeOpenApi {
    platform: string
    invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>
    setDocumentState(state: { filePath: string | null; folderPath: string | null; openFilePaths: string[]; dirty: boolean; hasDirtyDocuments: boolean; title: string; editorCommandsEnabled: boolean }): void
    rendererReady(): void
    closeAfterSave(): void
    onCommand(callback: (message: { command: string; payload: unknown }) => void): () => void
    onFileChanged(callback: (message: { filePath: string }) => void): () => void
  }

  interface Window {
    typeopen: TypeOpenApi
    find(
      searchString: string,
      caseSensitive?: boolean,
      backwards?: boolean,
      wrapAround?: boolean,
      wholeWord?: boolean,
      searchInFrames?: boolean,
      showDialog?: boolean
    ): boolean
  }
}
