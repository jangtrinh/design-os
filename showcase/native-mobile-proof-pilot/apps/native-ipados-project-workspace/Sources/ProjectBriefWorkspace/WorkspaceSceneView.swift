import SwiftUI

struct WorkspaceSceneView: View {
    let sceneID: String
    @ObservedObject var sceneRegistry: WorkspaceSceneRegistry

    @Environment(\.openWindow) private var openWindow
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @SceneStorage("project-brief-selected-id") private var selectedProjectID = BriefProject.commonplaceID
    @SceneStorage("project-brief-search") private var searchText = ""
    @SceneStorage("project-brief-offline") private var isOffline = false
    @SceneStorage("project-brief-last-saved-phase") private var lastSavedPhase = "active"

    @State private var projects = BriefProject.sample
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var preferredCompactColumn: NavigationSplitViewColumn = .sidebar
    @State private var appliedLaunchConfiguration = false
    @State private var sceneSessionID: String?

    private let launchConfiguration = WorkspaceLaunchConfiguration.parse(
        arguments: ProcessInfo.processInfo.arguments
    )

    private var matchingProjects: [BriefProject] {
        ProjectCatalog.filtered(projects, searchText: searchText)
    }

    private var selectedProject: BriefProject? {
        matchingProjects.first { $0.id == selectedProjectID }
    }

    private var displayedState: WorkspaceVisualState {
        if isOffline { return .offline }
        if launchConfiguration.visualState == .empty { return .empty }
        if !searchText.isEmpty { return .searching }
        if launchConfiguration.visualState == .secondWindow { return .secondWindow }
        if selectedProject != nil { return .selection }
        return .ready
    }

    var body: some View {
        NavigationSplitView(
            columnVisibility: $columnVisibility,
            preferredCompactColumn: $preferredCompactColumn
        ) {
            ProjectSidebarView(
                projects: projects,
                displayedState: displayedState,
                isOffline: isOffline,
                selection: $selectedProjectID,
                searchText: $searchText,
                retryConnection: { performChange { isOffline = false } },
                updateStatus: updateStatus
            )
        } detail: {
            ProjectDetailView(
                project: selectedProject,
                lastSavedPhase: lastSavedPhase,
                isSecondWindowState: launchConfiguration.visualState == .secondWindow,
                updateStatus: { status in
                    guard let selectedProject else { return }
                    updateStatus(selectedProject.id, status)
                },
                openWindow: openIndependentWindow
            )
        }
        .background {
            SceneSessionIDReader(onSessionID: registerSceneSession)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button(action: toggleColumns) {
                    Label(columnVisibility == .all ? "Collapse columns" : "Expand columns", systemImage: "sidebar.leading")
                }
                .keyboardShortcut("]", modifiers: .command)
                .accessibilityIdentifier("toggle-columns")

                Button(action: openIndependentWindow) {
                    Label("Open new window", systemImage: "rectangle.on.rectangle")
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
                .accessibilityIdentifier("open-new-window-toolbar")
            }
        }
        .onAppear {
            applyLaunchConfiguration()
            recordCurrentSelection()
            sceneRegistry.refreshConnectedScenes()
        }
        .onDisappear {
            sceneRegistry.unregister(workspaceSceneID: sceneID)
        }
        .onChange(of: searchText) { _, _ in
            reconcileSelection()
            recordCurrentSelection()
        }
        .onChange(of: selectedProjectID) { _, _ in
            recordCurrentSelection()
        }
        .onChange(of: scenePhase) { _, phase in
            sceneRegistry.refreshConnectedScenes()
            if phase == .background || phase == .inactive {
                lastSavedPhase = phase == .background ? "background" : "inactive"
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Project brief workspace scene")
        .accessibilityValue(sceneAccessibilityValue)
        .accessibilityIdentifier("workspace-scene")
    }

    private func applyLaunchConfiguration() {
        guard !appliedLaunchConfiguration else { return }
        appliedLaunchConfiguration = true

        if launchConfiguration.resetsSceneState {
            selectedProjectID = BriefProject.commonplaceID
            searchText = ""
            isOffline = false
            lastSavedPhase = "active"
        }

        switch launchConfiguration.visualState {
        case .ready: break
        case .searching: searchText = "design"
        case .selection: selectedProjectID = "design-os-mobile"
        case .empty: searchText = "no matching local brief"
        case .offline: isOffline = true
        case .secondWindow: selectedProjectID = "omniact"
        }
        reconcileSelection()
    }

    private func updateStatus(_ projectID: BriefProject.ID, _ status: ProjectStatus) {
        performChange {
            guard let index = projects.firstIndex(where: { $0.id == projectID }) else { return }
            projects[index].status = status
            reconcileSelection()
        }
    }

    private func toggleColumns() {
        performChange {
            columnVisibility = columnVisibility == .all ? .detailOnly : .all
        }
    }

    private func openIndependentWindow() {
        openWindow(id: WorkspaceWindow.independentID, value: WorkspaceWindow.Value())
    }

    private func reconcileSelection() {
        guard !matchingProjects.contains(where: { $0.id == selectedProjectID }),
              let firstMatchingProject = matchingProjects.first
        else {
            return
        }
        selectedProjectID = firstMatchingProject.id
    }

    private var sceneAccessibilityValue: String {
        let currentSelection = selectedProject.map { "Selected brief: \($0.name)" }
            ?? "No selected brief"
        return "\(currentSelection). Connected scenes: \(sceneRegistry.connectedSceneCount). "
            + "Scene selections: \(sceneRegistry.selectionSummary)."
    }

    private func recordCurrentSelection() {
        guard sceneSessionID != nil else { return }
        sceneRegistry.recordSelection(selectedProject?.name ?? "No selected brief", for: sceneID)
    }

    private func registerSceneSession(_ sessionID: String) {
        guard sceneSessionID != sessionID else { return }
        sceneSessionID = sessionID
        sceneRegistry.register(workspaceSceneID: sceneID, sessionID: sessionID)
        recordCurrentSelection()
    }

    private func performChange(_ change: @escaping () -> Void) {
        if reduceMotion {
            change()
        } else {
            withAnimation(.snappy, change)
        }
    }
}
