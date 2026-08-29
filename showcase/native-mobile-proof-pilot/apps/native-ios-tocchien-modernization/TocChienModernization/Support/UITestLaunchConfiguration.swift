import Foundation

@MainActor
enum UITestLaunchConfiguration {
    static func apply(to store: TocChienStore) {
        let arguments = ProcessInfo.processInfo.arguments
        guard arguments.contains("-ui-reset-state") else { return }
        if value(after: "-ui-screen", in: arguments) == "dictionary" {
            store.selectedTab = .dictionary
        }
        if let identifier = value(after: "-ui-champion", in: arguments) {
            store.openChampion(id: identifier)
        }
        if let query = value(after: "-ui-query", in: arguments) {
            store.dictionaryQuery = query
        }
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
}
