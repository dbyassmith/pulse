#!/bin/bash
xcodebuild -scheme goldfish -project goldfish.xcodeproj -destination 'platform=iOS Simulator,name=iPhone 17' -clonedSourcePackagesDirPath SourcePackages build 2>&1 | tail -80
