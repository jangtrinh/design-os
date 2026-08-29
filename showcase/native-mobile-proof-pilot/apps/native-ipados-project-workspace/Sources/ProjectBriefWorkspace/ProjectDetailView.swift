import SwiftUI

struct ProjectDetailView: View {
    let project: BriefProject?
    let lastSavedPhase: String
    let isSecondWindowState: Bool
    let updateStatus: (ProjectStatus) -> Void
    let openWindow: () -> Void

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Group {
            if let project {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        header(for: project)
                        summaryCard(for: project)
                        statusActions(for: project)
                        sceneCard
                        Button(action: openWindow) {
                            Label("Open independent workspace window", systemImage: "rectangle.on.rectangle")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityHint("Opens another scene with its own selection and search state.")
                        .accessibilityIdentifier("open-second-window")
                    }
                    .padding()
                    .frame(maxWidth: 760, alignment: .leading)
                }
                .accessibilityIdentifier("project-detail")
            } else {
                ContentUnavailableView(
                    "Choose a project",
                    systemImage: "sidebar.leading",
                    description: Text("A selected brief remains available when the split view collapses or expands.")
                )
                .accessibilityIdentifier("no-selection")
            }
        }
    }

    private func header(for project: BriefProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(project.name)
                .font(.largeTitle.weight(.bold))
                .accessibilityIdentifier("detail-title")
            Text("Owner: \(project.owner)")
                .font(.title3)
                .foregroundStyle(.secondary)
            Label(project.status.rawValue, systemImage: "circle.inset.filled")
                .font(.headline)
        }
        .accessibilityElement(children: .combine)
    }

    private func summaryCard(for project: BriefProject) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Brief", systemImage: "doc.text")
                .font(.headline)
            Text(project.summary)
                .font(.body)
            Text("This local, sanitized content works without a network connection.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func statusActions(for project: BriefProject) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Project status")
                .font(.headline)
            Menu {
                ForEach(ProjectStatus.allCases) { status in
                    Button("Mark \(status.rawValue)") { updateStatus(status) }
                }
            } label: {
                Label("Current: \(project.status.rawValue)", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("status-menu")

            Button("Mark \(project.status.next.rawValue)") {
                updateStatus(project.status.next)
            }
            .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityHint("Cycles through the local project statuses.")
        }
    }

    private var sceneCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Scene restoration", systemImage: "rectangle.3.group")
                .font(.headline)
            Text("Selection, search, and offline recovery are scoped to this scene.")
            Text("Last saved when scene became: \(lastSavedPhase).")
                .foregroundStyle(.secondary)
            if isSecondWindowState {
                Text("Second-window visual state is active.")
                    .font(.subheadline.weight(.semibold))
            }
        }
        .font(.body)
        .padding()
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityIdentifier("scene-restoration")
    }

    @ViewBuilder
    private var cardBackground: some View {
        if reduceTransparency {
            Color(uiColor: .secondarySystemBackground)
        } else {
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.regularMaterial)
        }
    }
}
