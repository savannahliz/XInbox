import Cocoa

let directory = CommandLine.arguments[1]
let sizes = [(16, "icon_16x16"), (32, "icon_16x16@2x"), (32, "icon_32x32"), (64, "icon_32x32@2x"), (128, "icon_128x128"), (256, "icon_128x128@2x"), (256, "icon_256x256"), (512, "icon_256x256@2x"), (512, "icon_512x512"), (1024, "icon_512x512@2x")]
for (size, name) in sizes {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let scale = CGFloat(size) / 1024
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    NSColor(calibratedRed: 0.035, green: 0.047, blue: 0.039, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 70, y: 70, width: 884, height: 884), xRadius: 150, yRadius: 150).fill()
    let green = NSColor(calibratedRed: 0.545, green: 0.812, blue: 0.227, alpha: 1)
    green.setStroke()
    let border = NSBezierPath(roundedRect: NSRect(x: 122, y: 122, width: 780, height: 780), xRadius: 106, yRadius: 106)
    border.lineWidth = 10
    border.stroke()
    let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.monospacedSystemFont(ofSize: 370, weight: .bold), .foregroundColor: green]
    ("IN" as NSString).draw(at: NSPoint(x: 268, y: 340), withAttributes: attributes)
    NSColor(calibratedRed: 1, green: 0.847, blue: 0.290, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(x: 268, y: 278, width: 220, height: 12)).fill()
    NSColor(calibratedRed: 0.431, green: 0.608, blue: 1, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(x: 516, y: 278, width: 240, height: 12)).fill()
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name + ".png"))
}
