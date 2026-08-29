import SwiftUI

struct WorkspaceStateBanner: View {
    let state: WorkspaceVisualState
    let detail: String
    let retry: (() -> Void)?

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: symbolName)
                .imageScale(.medium)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(state.title)
                    .font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if let retry {
                Button("Retry connection", action: retry)
                    .buttonStyle(.bordered)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("retry-connection")
            }
        }
        .padding(12)
        .background {
            if reduceTransparency {
                Color(uiColor: .secondarySystemBackground)
            } else {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.thinMaterial)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("workspace-state")
    }

    private var symbolName: String {
        switch state {
        case .offline: "wifi.slash"
        case .empty: "magnifyingglass"
        case .searching: "magnifyingglass.circle"
        case .secondWindow: "rectangle.on.rectangle"
        case .ready, .selection: "checkmark.circle"
        }
    }
}
