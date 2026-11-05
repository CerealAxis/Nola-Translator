export interface WorkspaceView {
  pinned: boolean
  zoom: number
}

export interface WorkspaceViewApi {
  read(): Promise<WorkspaceView>
  update(patch: Partial<WorkspaceView>): Promise<WorkspaceView>
}
