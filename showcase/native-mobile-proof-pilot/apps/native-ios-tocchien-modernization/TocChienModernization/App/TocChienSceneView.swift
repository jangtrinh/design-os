import SwiftUI

struct TocChienSceneView: View {
    @State private var store: TocChienStore

    init() {
        let store = TocChienStore()
        UITestLaunchConfiguration.apply(to: store)
        _store = State(initialValue: store)
    }

    var body: some View {
        if let error = store.contentError {
            ContentUnavailableView(
                "Không thể đọc dữ liệu cục bộ",
                systemImage: "exclamationmark.triangle",
                description: Text(error)
            )
        } else {
            RootTabView(store: store)
        }
    }
}
