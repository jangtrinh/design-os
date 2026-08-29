import SwiftUI

struct HistoricalDataNotice: View {
    let metadata: ContentMetadata
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 6))
    }

    var body: some View {
        layout {
            Image(systemName: "clock.arrow.circlepath")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(metadata.historicalNotice)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("historical-data-notice")
        .accessibilityLabel("Dữ liệu lịch sử. \(metadata.historicalNotice)")
    }
}
