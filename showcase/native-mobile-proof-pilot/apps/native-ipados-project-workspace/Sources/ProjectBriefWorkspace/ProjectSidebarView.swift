import SwiftUI

struct ProjectSidebarView: View {
    let projects: [BriefProject]
    let displayedState: WorkspaceVisualState
    let isOffline: Bool
    @Binding var selection: String
    @Binding var searchText: String
    let retryConnection: () -> Void
    let updateStatus: (BriefProject.ID, ProjectStatus) -> Void

    @State private var hoveredProjectID: BriefProject.ID?
    @FocusState private var focusedProjectID: BriefProject.ID?

    private var filteredProjects: [BriefProject] {
        ProjectCatalog.filtered(projects, searchText: searchText)
    }

    var body: some View {
        VStack(spacing: 12) {
            WorkspaceStateBanner(
                state: displayedState,
                detail: bannerDetail,
                retry: isOffline ? retryConnection : nil
            )
            .padding(.horizontal)

            if filteredProjects.isEmpty {
                ContentUnavailableView {
                    Label("No matching briefs", systemImage: "magnifyingglass")
                } description: {
                    Text("Clear the search to return to all local project briefs.")
                } actions: {
                    Button("Clear search") { searchText = "" }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("clear-search")
                }
                .accessibilityIdentifier("empty-search")
            } else {
                List(selection: selectionBinding) {
                    ForEach(filteredProjects) { project in
                        ProjectRow(
                            project: project,
                            isHovered: hoveredProjectID == project.id,
                            isFocused: focusedProjectID == project.id
                        )
                            .tag(project.id)
                            .contentShape(Rectangle())
                            .focusable()
                            .focused($focusedProjectID, equals: project.id)
                            .onHover { isHovered in
                                hoveredProjectID = isHovered ? project.id : nil
                            }
                            .contextMenu {
                                ForEach(ProjectStatus.allCases) { status in
                                    Button("Mark \(status.rawValue)") {
                                        updateStatus(project.id, status)
                                    }
                                }
                            }
                            .accessibilityIdentifier("project-row-\(project.id)")
                    }
                }
                .listStyle(.sidebar)
                .accessibilityIdentifier("project-list")
            }
        }
        .navigationTitle("Project Briefs")
        .searchable(text: $searchText, prompt: "Search local briefs")
    }

    private var bannerDetail: String {
        if isOffline {
            return "Local briefs are available. Retry restores the ready state."
        }
        if !searchText.isEmpty {
            return "Showing local results."
        }
        return "Choose a project to inspect its brief and update its status."
    }

    private var selectionBinding: Binding<String?> {
        Binding(
            get: { selection },
            set: { newValue in
                if let newValue {
                    selection = newValue
                }
            }
        )
    }
}

private struct ProjectRow: View {
    let project: BriefProject
    let isHovered: Bool
    let isFocused: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "doc.text")
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(project.name)
                    .font(.headline)
                Text("\(project.status.rawValue) · \(project.owner)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 4)

            if isHovered {
                Image(systemName: "ellipsis.circle")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
        }
        .frame(minHeight: 44)
        .overlay {
            if isFocused {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(.tint, lineWidth: 2)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(project.name), \(project.status.rawValue), owner \(project.owner)")
        .accessibilityHint("Select to view the brief. A context menu can change status.")
    }
}
