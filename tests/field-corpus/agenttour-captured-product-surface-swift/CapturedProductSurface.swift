import SwiftUI

struct CapturedProductSurface: View {
    let step: TourStep?

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) {
                ProductNavigation()
                Divider()
                ProductContent(step: step)
                    .frame(minWidth: 540)
            }
            .frame(minWidth: 760)

            ProductContent(step: step)
                .frame(minWidth: 500)
        }
    }
}

private struct ProductContent: View {
    let step: TourStep?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.Spacing.xLarge) {
            VStack(alignment: .leading, spacing: DesignTokens.Spacing.small) {
                Text("Invite teammates")
                    .font(.title2.weight(.semibold))
                Text("Set up collaboration without exposing personal data.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Label("Sample snapshot", systemImage: "camera.viewfinder")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            InvitePanel(step: step)
                .frame(width: 440)
            Spacer(minLength: DesignTokens.Spacing.xLarge)
        }
        .padding(DesignTokens.Spacing.xLarge)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct ProductNavigation: View {
    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.Spacing.small) {
            Label("Sandbox", systemImage: "square.grid.2x2.fill")
                .font(.headline)
                .padding(.bottom, DesignTokens.Spacing.large)
            Label("Overview", systemImage: "chart.bar")
            Label("Campaigns", systemImage: "paperplane")
            Label("Audience", systemImage: "person.2")
            Label("Settings", systemImage: "gearshape")
            Spacer()
            Label("Help", systemImage: "questionmark.circle")
                .foregroundStyle(.secondary)
        }
        .padding(DesignTokens.Spacing.large)
        .frame(width: 176)
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .background(Color.insetSurface)
    }
}

private struct InvitePanel: View {
    let step: TourStep?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.Spacing.large) {
            Text("Team invitation")
                .font(.headline)
            VStack(alignment: .leading, spacing: DesignTokens.Spacing.small) {
                Text("Work email")
                    .font(.subheadline.weight(.medium))
                Text("teammate@example.test")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                    .padding(.horizontal, DesignTokens.Spacing.medium)
                    .background(Color.appBackground, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.small))
                    .overlay {
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.small)
                            .stroke(Color.separator)
                    }
            }

            HStack {
                Spacer()
                Text("Send invite")
                    .font(.body.weight(.semibold))
                    .padding(.horizontal, DesignTokens.Spacing.large)
                    .frame(minHeight: 44)
                    .background(.tint, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.small))
                    .foregroundStyle(.white)
                    .overlay {
                        if step?.id == 4 {
                            RoundedRectangle(cornerRadius: DesignTokens.Radius.medium)
                                .stroke(.tint, lineWidth: 3)
                                .padding(-6)
                                .accessibilityHidden(true)
                        }
                    }
                    .accessibilityLabel("Captured Send invite button")
            }

            if let step {
                HStack(alignment: .top, spacing: DesignTokens.Spacing.medium) {
                    Text("\(step.id)")
                        .font(.headline.monospacedDigit())
                        .frame(minWidth: 32, minHeight: 32)
                        .background(.tint, in: Circle())
                        .foregroundStyle(.white)
                    VStack(alignment: .leading, spacing: DesignTokens.Spacing.xSmall) {
                        Text(step.tooltipTitle)
                            .font(.headline)
                        Text(step.tooltipBody)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .layoutPriority(1)
                }
                .padding(DesignTokens.Spacing.large)
                .background(Color.insetSurface, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.medium))
                .overlay {
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.medium)
                        .stroke(Color.separator)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Tour step \(step.id). \(step.tooltipTitle). \(step.tooltipBody)")
            }
        }
        .padding(DesignTokens.Spacing.xLarge)
        .background(Color.insetSurface, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.large))
        .overlay {
            RoundedRectangle(cornerRadius: DesignTokens.Radius.large)
                .stroke(Color.separator)
        }
    }
}
