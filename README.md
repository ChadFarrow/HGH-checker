# 🎵 HGH Feed Checker

A web-based tool to visualize and validate your Homegrown Hits RSS feed, helping you spot errors and inconsistencies in your manually edited feed.

## Features

### 📊 **Dashboard Overview**
- **Total Episodes**: Count of all episodes in the feed
- **Feed Last Updated**: When the feed was last modified
- **Live Items**: Number of live streaming events
- **Total Duration**: Combined duration of all episodes

### 🔍 **Episode Analysis**
- **Episode Cards**: Detailed view of each episode with:
  - Episode number extraction
  - Duration and file size
  - Publication date
  - GUID (unique identifier)
  - Track listings with artist and title
  - Audio file information

### ✅ **Validation System**
- **Required Elements**: Checks for missing essential feed elements
- **Episode Consistency**: Validates episode numbering and GUIDs
- **File Validation**: Checks audio file URLs and sizes
- **Live Item Validation**: Ensures live events have required information
- **Duplicate Detection**: Identifies duplicate GUIDs across episodes
- **Podcast Index Compliance**: Validates podcast namespace elements
- **Value4Value Validation**: Checks Lightning Network payment configurations
- **Enhanced Metadata**: Validates chapters, person tags, and live streaming

### 🎯 **Error Categories**
- **❌ Errors**: Critical issues that break feed functionality
- **⚠️ Warnings**: Issues that may cause problems but don't break the feed
- **ℹ️ Info**: Suggestions for improving Podcast Index compatibility
- **✅ Success**: No validation issues found

## How to Use

1. **Open the Tool**: Open `index.html` in your web browser
2. **Fetch Feed**: Click the "Fetch Feed" button to load your RSS feed
3. **Review Results**: Examine the dashboard, episodes, and validation results
4. **Clear Data**: Use "Clear Data" to reset and start over

## What It Checks

### Channel Level
- Title, description, language, and link
- iTunes and podcast namespace elements
- Image and author information
- Podcast namespace compliance (GUID, medium, complete status)
- Value4Value configuration for Lightning Network payments

### Episode Level
- Title, GUID, and publication date
- Audio file enclosure (URL, type, size)
- Episode numbering consistency
- Track information extraction
- Duration and file size validation
- Podcast namespace elements (chapters, person tags, value4value)
- Enhanced metadata for Podcast Index discovery

### Live Items
- Title and status information
- Start and end times
- Chat room links
- Streaming URLs
- Value4Value support for live events
- Time range validation

### Technical Validation
- XML format correctness
- Required RSS elements
- Duplicate GUID detection
- File size anomalies
- Podcast namespace compliance
- Value4Value recipient validation
- Lightning Network address format checking
- Split percentage calculations

## Common Issues to Look For

### 🔴 **Critical Issues**
- Missing episode titles or GUIDs
- Broken audio file links
- Invalid XML formatting
- Duplicate episode identifiers

### 🟡 **Warning Signs**
- Missing publication dates
- Inconsistent episode numbering
- Unusually small file sizes
- Missing channel metadata
- Incomplete podcast namespace elements
- Value4Value configuration issues
- Inconsistent metadata across episodes

### 🟢 **Good Practices**
- Consistent episode naming
- Proper GUID formatting
- Complete track information
- Regular feed updates
- Complete podcast namespace implementation
- Consistent Value4Value support
- Enhanced metadata for all episodes
- Live streaming integration

## Technical Details

- **CORS Handling**: Uses a proxy service to fetch external feeds
- **XML Parsing**: Robust parsing of RSS and podcast namespace elements
- **Responsive Design**: Works on desktop and mobile devices
- **No Dependencies**: Pure HTML, CSS, and JavaScript

## Podcast Index Features

### **Namespace Validation**
- Validates `podcast:guid`, `podcast:medium`, `podcast:complete`, and `podcast:block`
- Checks for proper podcast namespace implementation
- Ensures compatibility with Podcast Index aggregation

### **Value4Value Support**
- Validates Lightning Network payment configurations
- Checks recipient splits add up to 100%
- Validates Lightning address formats
- Ensures proper value4value metadata

### **Enhanced Metadata**
- Tracks chapters, person tags, and value4value usage
- Provides consistency recommendations
- Calculates Podcast Index readiness score
- Identifies missing enhanced features

### **Live Streaming**
- Validates live item configurations
- Checks time ranges and streaming URLs
- Ensures proper live event metadata
- Supports live value4value integration

## File Structure

```
HGH checker/
├── index.html          # Main application interface
├── styles.css          # Styling and layout
├── script.js           # Feed parsing and validation logic
└── README.md           # This documentation
```

## Browser Compatibility

- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **Mobile**: Responsive design for mobile devices
- **JavaScript**: Requires ES6+ support

## Troubleshooting

### Feed Won't Load
- Check if the feed URL is accessible
- Verify the feed is valid RSS/XML
- Check browser console for error messages

### Validation Issues
- Review the specific error messages
- Check your RSS feed structure
- Verify all required elements are present

### Display Problems
- Ensure JavaScript is enabled
- Check for browser console errors
- Try refreshing the page

## Contributing

Feel free to enhance this tool by:
- Adding more validation rules
- Improving the UI/UX
- Adding export functionality
- Supporting additional feed formats

## License

This tool is provided as-is for the Homegrown Hits community. Use it to maintain the quality of your RSS feed!
