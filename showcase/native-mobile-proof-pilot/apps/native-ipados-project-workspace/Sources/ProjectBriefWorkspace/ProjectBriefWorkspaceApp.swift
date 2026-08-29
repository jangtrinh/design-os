import SwiftUI

@main
struct ProjectBriefWorkspaceApp: App {
    @StateObject private var sceneRegistry = WorkspaceSceneRegistry()

    var body: some Scene {
        WindowGroup {
            WorkspaceSceneView(
                sceneID: WorkspaceWindow.primarySceneID,
                sceneRegistry: sceneRegistry
            )
        }
        WindowGroup(id: WorkspaceWindow.independentID, for: WorkspaceWindow.Value.self) { windowValue in
            WorkspaceSceneView(
                sceneID: windowValue.wrappedValue?.id.uuidString ?? WorkspaceWindow.primarySceneID,
                sceneRegistry: sceneRegistry
            )
        }
    }
}

enum WorkspaceWindow {
    static let independentID = "project-brief-independent-workspace"
    static let primarySceneID = "primary-project-brief-scene"

    struct Value: Codable, Hashable {
        let id: UUID

        init(id: UUID = UUID()) {
            self.id = id
        }
    }
}
