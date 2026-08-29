import SwiftUI

struct DictionarySearchView: View {
    @ObservedObject private var store: DictionarySearchStore
    @SceneStorage("dictionary.search.query") private var persistedQuery = ""
    @SceneStorage("dictionary.search.detail") private var persistedDetailIdentifier = ""
    @State private var path: [String]
    @FocusState private var searchFieldFocused: Bool
    @AccessibilityFocusState private var searchAccessibilityFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    init(store: DictionarySearchStore) {
        _store = ObservedObject(wrappedValue: store)
        _path = State(initialValue: store.initialDetailIdentifier.map { [$0] } ?? [])
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    DictionarySearchHeader(
                        query: $persistedQuery,
                        focus: $searchFieldFocused,
                        accessibilityFocus: $searchAccessibilityFocused,
                        onSubmit: { store.submit(query: persistedQuery) }
                    )

                    DictionaryStateContent(
                        state: store.state,
                        onRetry: { store.retry() }
                    )
                }
                .frame(maxWidth: 700, alignment: .leading)
                .padding(.horizontal)
                .padding(.vertical, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Dictionary")
            .navigationDestination(for: String.self) { identifier in
                if let entry = DictionaryEntry.localEntries.first(where: { $0.id == identifier }) {
                    DictionaryDetailView(entry: entry)
                } else {
                    ContentUnavailableView(
                        "Entry unavailable",
                        systemImage: "exclamationmark.triangle",
                        description: Text("Return to search and choose another local entry.")
                    )
                }
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: store.state)
        .onAppear(perform: configureScene)
        .onChange(of: persistedQuery) { _, newValue in
            store.updateDraftQuery(newValue)
        }
        .onChange(of: path) { _, newPath in
            persistedDetailIdentifier = newPath.last ?? ""
            if newPath.isEmpty {
                restoreSearchFocus()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                persistedDetailIdentifier = path.last ?? ""
            }
        }
    }

    private func configureScene() {
        if store.resetsRestoration {
            persistedQuery = store.initialQuery
            persistedDetailIdentifier = ""
        } else if store.isLaunchScenario {
            persistedQuery = store.initialQuery
        } else if !persistedQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            store.restore(query: persistedQuery)
        }

        if path.isEmpty {
            if let initialDetailIdentifier = store.initialDetailIdentifier {
                path = [initialDetailIdentifier]
            } else if !persistedDetailIdentifier.isEmpty {
                path = [persistedDetailIdentifier]
            }
        }

        if !store.isLaunchScenario {
            restoreSearchFocus()
        }
    }

    private func restoreSearchFocus() {
        DispatchQueue.main.async {
            searchFieldFocused = true
            searchAccessibilityFocused = true
        }
    }
}
