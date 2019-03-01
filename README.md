# Sidebery

[![https://addons.mozilla.org/en-US/firefox/addon/sidebery/](https://addons.cdn.mozilla.net/static/img/addons-buttons/AMO-button_2.png)](https://addons.mozilla.org/en-US/firefox/addon/sidebery/)

Firefox addon for managing tabs, containers (contextual identities) and bookmarks in sidebar. Supports both flat and tree tabs layout, drag-and-drop actions, different proxy settings for each container, synchronization and much more.


## Features

- Vertical tabs layout (flat and tree)
- Bookmarks operations
- Drag-and-drop
- Contextual Identities management
- Synchronizing containers
- Different proxy settings for each containers
- Creating tabs snapshots for easy recovering
- Light and dark themes
- Customizable styles
- Configurable navigation with mouse and keyboard
- Multiple tabs/bookmarks selection with right mouse button


## Hide/customize native panels

In 'Profile Directory' `(Menu > Help > Troubleshooting Information > Profile Directory)` 
create folder `chrome` with file `userChrome.css`:

```css
@-moz-document url("chrome://browser/content/browser.xul") {
  /* --- Completely hide tabs strip  --- */
  #TabsToolbar {
    visibility: collapse !important;
  }
  /* --- OR Hide tabs strip only in fullscreen --- */
  /* #TabsToolbar[inFullscreen="true"] {
    visibility: collapse !important;
  } */

  /* --- Preserve top panel height (macos) --- */
  /* #TabsToolbar {
    height: 30px !important;
  } */

  /* --- Hide content of top bar --- */
  /* #TabsToolbar > * {
    visibility: collapse;
  } */

  /* --- Hide sidebar top-menu --- */
  #sidebar-header {
    visibility: collapse;
  }

  /* --- Customize border between sidebar and page --- */
  /* #sidebar-splitter {
    width: 2px !important;
    border: none !important;
    background-color: #242424 !important;
  } */
}
```


## Build

> Framework: Vue  
> Bundler: Parcel  
> Tests: Jest  

Install dependencies: `npm install`  
Start dev: `npm run dev`  
Build to ./dist: `npm run build`  


## Licence

MIT