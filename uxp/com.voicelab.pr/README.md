# Introduction

This sample plugin demonstrates the usage of WebView in your UXP plugin. WebViews are particularly handy when certain web features, such as webGL, are not innately available in UXP.

The aim of this plugin is 
- To showcase WebView within a dialog and a panel.
- Demo the communication between the plugin panel and local html file


## Documentation
[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) - Common for all Host Applications.

## Compatibility
UXP v6.4 or higher

### Premiere Pro
Since Premiere Pro v25.0.0

## Getting Started


### Load the plugin via UDT

1. Make sure your application is running and you can see it under `Connected apps`
2. Click on 'Add Plugin' button and select the `manifest.json` of this plugin.
3. Click "Load" in the corresponding workspace entry. 

Switch over to the host app, and the plugin's panel will be running.


## Deep dive

### manifest permission
To use WebViews in a plugin, the `webview` permission is necessary in [manifest.json](./manifest.json).
- webview.allow - Enables WebView access to the plugin.
- webview.domains - Domain of the web URL.
- webview.enableMessageBridge - Enables the content loaded within WebView to communicate with the plugin.

### uxpAllowInspector
In [index.html](./index.html), notice the `uxpAllowInspector` added to the WebView element inside the dialog. The purpose of this property is to enable debugging the contents of UXP WebView. Once set to `true`, you can right-click on the webview and select 'Inspect Element' to debug and view the `console.logs` from the webview content separately.</br>
<b>Example:</b></br>
```html
<webview width="100%" height="360px" src="https://www.adobe.com" uxpAllowInspector="true" ></webview>
```
