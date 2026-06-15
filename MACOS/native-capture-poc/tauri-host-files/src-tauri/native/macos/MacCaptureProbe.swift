import AppKit
import CoreGraphics
import Foundation

struct CaptureOutput: Encodable {
    let idleSeconds: Double
    let foregroundPid: Int32?
    let apps: [AppSnapshot]
}

struct AppSnapshot: Encodable {
    let pid: Int32
    let processName: String
    let executablePath: String
    let bundleId: String?
    let displayName: String
    let bundlePath: String?
    let iconPngBase64: String?
    let isForeground: Bool
    let hasVisibleWindow: Bool
}

func visibleWindowPids() -> Set<Int32> {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let rawList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    var pids = Set<Int32>()
    for window in rawList {
        let layer = window[kCGWindowLayer as String] as? Int ?? 0
        guard layer == 0 else {
            continue
        }
        if let pid = window[kCGWindowOwnerPID as String] as? Int32 {
            pids.insert(pid)
        }
    }
    return pids
}

func pngBase64(for icon: NSImage?) -> String? {
    guard let icon else {
        return nil
    }

    let targetSize = NSSize(width: 64, height: 64)
    let image = NSImage(size: targetSize)
    image.lockFocus()
    icon.draw(in: NSRect(origin: .zero, size: targetSize))
    image.unlockFocus()

    guard
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let png = bitmap.representation(using: .png, properties: [:])
    else {
        return nil
    }

    return png.base64EncodedString()
}

func secondsSinceLastInput() -> Double {
    let eventTypes: [CGEventType] = [
        .leftMouseDown,
        .rightMouseDown,
        .mouseMoved,
        .leftMouseDragged,
        .rightMouseDragged,
        .keyDown,
        .scrollWheel,
        .tabletPointer
    ]

    let seconds = eventTypes.map {
        CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: $0)
    }

    return seconds.min() ?? 0
}

func capture() -> CaptureOutput {
    let foregroundPid = NSWorkspace.shared.frontmostApplication?.processIdentifier
    let windowPids = visibleWindowPids()
    let apps = NSWorkspace.shared.runningApplications.compactMap { app -> AppSnapshot? in
        guard let executablePath = app.executableURL?.path else {
            return nil
        }

        let pid = app.processIdentifier
        let fallbackName = URL(fileURLWithPath: executablePath).deletingPathExtension().lastPathComponent
        let displayName = app.localizedName ?? fallbackName
        let processName = URL(fileURLWithPath: executablePath).lastPathComponent

        return AppSnapshot(
            pid: pid,
            processName: processName,
            executablePath: executablePath,
            bundleId: app.bundleIdentifier,
            displayName: displayName,
            bundlePath: app.bundleURL?.path,
            iconPngBase64: pngBase64(for: app.icon),
            isForeground: foregroundPid == pid,
            hasVisibleWindow: windowPids.contains(pid)
        )
    }

    return CaptureOutput(
        idleSeconds: secondsSinceLastInput(),
        foregroundPid: foregroundPid,
        apps: apps
    )
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

do {
    let data = try encoder.encode(capture())
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("failed to encode capture output: \(error)\n".utf8))
    exit(1)
}
