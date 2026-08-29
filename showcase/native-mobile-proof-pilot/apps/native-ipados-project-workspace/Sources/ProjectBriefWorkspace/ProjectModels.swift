import Foundation

enum ProjectStatus: String, CaseIterable, Codable, Identifiable {
    case inReview = "In review"
    case active = "Active"
    case draft = "Draft"

    var id: String { rawValue }

    var next: ProjectStatus {
        switch self {
        case .inReview: .active
        case .active: .draft
        case .draft: .inReview
        }
    }
}

struct BriefProject: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    var status: ProjectStatus
    let owner: String
    let summary: String

    static let commonplaceID = "commonplace"
    static let sample = [
        BriefProject(
            id: commonplaceID,
            name: "Commonplace",
            status: .inReview,
            owner: "Jang",
            summary: "A calm notes workspace with resilient sync states."
        ),
        BriefProject(
            id: "design-os-mobile",
            name: "DESIGN:OS Mobile",
            status: .active,
            owner: "Native team",
            summary: "Evidence-driven SwiftUI arms for iPhone and iPad."
        ),
        BriefProject(
            id: "omniact",
            name: "OmniAct",
            status: .draft,
            owner: "Product",
            summary: "A focused command surface for macOS."
        )
    ]
}

enum ProjectCatalog {
    static func filtered(_ projects: [BriefProject], searchText: String) -> [BriefProject] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return projects }

        return projects.filter { project in
            [project.name, project.owner, project.summary, project.status.rawValue]
                .contains { $0.localizedCaseInsensitiveContains(query) }
        }
    }
}

enum WorkspaceVisualState: String, CaseIterable {
    case ready
    case searching
    case selection
    case empty
    case offline
    case secondWindow = "second-window"

    var title: String {
        switch self {
        case .ready: "Ready"
        case .searching: "Searching"
        case .selection: "Selection"
        case .empty: "Empty"
        case .offline: "Offline"
        case .secondWindow: "Second window"
        }
    }
}

struct WorkspaceLaunchConfiguration: Equatable {
    let visualState: WorkspaceVisualState
    let resetsSceneState: Bool

    static func parse(arguments: [String]) -> WorkspaceLaunchConfiguration {
        let resetsSceneState = arguments.contains("-ui-testing-reset-scene-state")
        guard let index = arguments.firstIndex(of: "-ui-testing-state"),
              arguments.indices.contains(index + 1),
              let state = WorkspaceVisualState(rawValue: arguments[index + 1])
        else {
            return WorkspaceLaunchConfiguration(
                visualState: .ready,
                resetsSceneState: resetsSceneState
            )
        }

        return WorkspaceLaunchConfiguration(
            visualState: state,
            resetsSceneState: resetsSceneState
        )
    }
}
