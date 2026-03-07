#!/bin/bash
xcodebuild -scheme pulse -project pulse.xcodeproj -destination 'platform=iOS Simulator,name=iPhone 17' -clonedSourcePackagesDirPath SourcePackages build 2>&1 | tail -80
