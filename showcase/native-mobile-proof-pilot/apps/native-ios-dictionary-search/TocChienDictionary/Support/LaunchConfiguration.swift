import Foundation

enum LaunchVisualState: String, Sendable {
    case ready
    case loading
    case results
    case empty
    case offline
    case detail

    var defaultQuery: String {
        switch self {
        case .loading, .offline, .detail:
            return "keen"
        case .ready, .results, .empty:
            return ""
        }
    }
}

struct LaunchConfiguration: Sendable {
    let visualState: LaunchVisualState?
    let query: String?
    let resetsRestoration: Bool

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        visualState = Self.value(after: "-ui-state", in: arguments)
            .flatMap { LaunchVisualState(rawValue: $0.lowercased()) }
        query = Self.value(after: "-ui-query", in: arguments)
        resetsRestoration = arguments.contains("-ui-reset-state")
    }

    static var current: LaunchConfiguration {
        LaunchConfiguration()
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let flagIndex = arguments.firstIndex(of: flag) else { return nil }
        let valueIndex = arguments.index(after: flagIndex)
        guard valueIndex < arguments.endIndex else { return nil }
        return arguments[valueIndex]
    }
}
