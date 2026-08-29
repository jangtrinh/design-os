import SwiftUI

@main
struct TocChienDictionaryApp: App {
    @StateObject private var store: DictionarySearchStore

    init() {
        let configuration = LaunchConfiguration.current
        _store = StateObject(
            wrappedValue: DictionarySearchStore(launchConfiguration: configuration)
        )
    }

    var body: some Scene {
        WindowGroup {
            DictionarySearchView(store: store)
        }
    }
}
