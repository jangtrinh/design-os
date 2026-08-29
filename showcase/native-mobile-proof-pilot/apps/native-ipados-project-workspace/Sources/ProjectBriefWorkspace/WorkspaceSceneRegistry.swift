import Combine
import UIKit

final class WorkspaceSceneRegistry: ObservableObject {
    @Published private(set) var connectedSessionIDs: Set<String> = []
    @Published private(set) var selectionsBySceneID: [String: String] = [:]
    private var sessionIDByWorkspaceSceneID: [String: String] = [:]

    var connectedSceneCount: Int {
        connectedSessionIDs.count
    }

    var selectionSummary: String {
        let selections = selectionsBySceneID.values.sorted()
        return selections.isEmpty ? "No selections recorded" : selections.joined(separator: ", ")
    }

    static func prunedSelections(
        _ selections: [String: String],
        keepingSessionIDs sessionIDs: Set<String>
    ) -> [String: String] {
        selections.filter { sessionIDs.contains($0.key) }
    }

    func refreshConnectedScenes() {
        let observedSessionIDs = Set(
            UIApplication.shared.connectedScenes.map { $0.session.persistentIdentifier }
        )
        connectedSessionIDs = observedSessionIDs
        selectionsBySceneID = Self.prunedSelections(
            selectionsBySceneID,
            keepingSessionIDs: observedSessionIDs
        )
    }

    func register(workspaceSceneID: String, sessionID: String) {
        sessionIDByWorkspaceSceneID[workspaceSceneID] = sessionID
        refreshConnectedScenes()
    }

    func recordSelection(_ selection: String, for workspaceSceneID: String) {
        guard let sessionID = sessionIDByWorkspaceSceneID[workspaceSceneID] else { return }
        selectionsBySceneID[sessionID] = selection
    }

    func unregister(workspaceSceneID: String) {
        guard let sessionID = sessionIDByWorkspaceSceneID.removeValue(forKey: workspaceSceneID) else {
            return
        }
        selectionsBySceneID.removeValue(forKey: sessionID)
        refreshConnectedScenes()
    }
}
