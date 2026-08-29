import SwiftUI

struct HistoricalDataNotice: View {
    let metadata: ContentMetadata

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "clock.arrow.circlepath")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(metadata.historicalNotice)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("historical-data-notice")
        .accessibilityLabel("Dữ liệu lịch sử. \(metadata.historicalNotice)")
    }
}
