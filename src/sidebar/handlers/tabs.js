import { DEFAULT_CTX_ID } from '../../../addon/defaults'

const GROUP_URL = browser.runtime.getURL('/group/group.html')
const URL_HOST_PATH_RE = /^([a-z0-9-]{1,63}\.)+\w+(:\d+)?\/[A-Za-z0-9-._~:/?#[\]%@!$&'()*+,;=]*$/

/**
 * tabs.onCreated
 */
function onTabCreated(tab) {
  if (tab.windowId !== this.state.windowId) return

  if (
    this.state.highlightOpenBookmarks &&
    this.state.bookmarksUrlMap &&
    this.state.bookmarksUrlMap[tab.url]
  ) {
    for (let b of this.state.bookmarksUrlMap[tab.url]) {
      b.isOpen = true
    }
  }

  this.actions.closeCtxMenu()
  this.actions.resetSelection()

  // Get target panel and index
  let panel, index

  let treeAllowed =
    this.state.moveNewTabParent === 'first_child' ||
    this.state.moveNewTabParent === 'last_child' ||
    this.state.moveNewTabParent === 'none' ||
    this.state.moveNewTab === 'first_child' ||
    this.state.moveNewTab === 'last_child'

  if (this.state.newTabsPosition && this.state.newTabsPosition[tab.index]) {
    let position = this.state.newTabsPosition[tab.index]
    panel = this.state.panelsMap[position.panel]
    if (!panel) panel = this.state.panelsMap[DEFAULT_CTX_ID]
    index = tab.index
    tab.openerTabId = position.parent
    treeAllowed = true
    delete this.state.newTabsPosition[tab.index]
  } else {
    panel = this.actions.getPanelForNewTab(tab)
    index = this.actions.getIndexForNewTab(panel, tab)
    if (tab.openerTabId === undefined) {
      tab.openerTabId = this.actions.getParentForNewTab(panel, tab)
    }
    if (index === undefined) {
      if (panel.moveTabCtx !== 'none' && tab.openerTabId === undefined) {
        index = panel.tabs.length ? panel.endIndex + 1 : panel.endIndex
      } else {
        index = tab.index
      }
      if (panel.startIndex > index || panel.endIndex + 1 < index) {
        let prevTab = this.state.tabs[tab.index - 1]
        let nextTab = this.state.tabs[tab.index + 1]

        if (prevTab) panel = this.state.panelsMap[prevTab.panelId]
        else if (nextTab) panel = this.state.panelsMap[nextTab.panelId]
        else panel = this.state.panels.find(p => p.tabs)
      }
    }
  }

  // If new tab has wrong possition - move it
  if (!tab.pinned && tab.index !== index) {
    tab.destPanelId = panel.id
    browser.tabs.move(tab.id, { index })
  }

  // Shift tabs after inserted one. (NOT detected by vue)
  for (let i = index; i < this.state.tabs.length; i++) {
    this.state.tabs[i].index++
  }

  // Set default custom props (for reactivity)
  tab.panelId = panel.id
  tab.index = index
  tab.isParent = false
  tab.folded = false
  if (!treeAllowed && tab.openerTabId) tab.parentId = undefined
  if (tab.parentId === undefined) tab.parentId = -1
  else tab.openerTabId = tab.parentId
  tab.lvl = 0
  tab.sel = false
  tab.invisible = false
  if (!tab.favIconUrl) tab.favIconUrl = ''
  else if (tab.favIconUrl.startsWith('chrome')) tab.favIconUrl = ''
  tab.updated = false
  tab.loading = false
  tab.warn = false
  if (tab.favIconUrl === 'chrome://global/skin/icons/warning.svg') {
    tab.warn = true
  }

  // Put new tab in tabs list
  this.state.tabsMap[tab.id] = tab
  this.state.tabs.splice(index, 0, tab)

  // Put new tab in panel
  if (!tab.pinned && panel && panel.tabs) {
    let targetIndex = index - panel.startIndex
    if (panel.tabs.length === 0) targetIndex = 0
    if (targetIndex <= panel.tabs.length) {
      panel.tabs.splice(targetIndex, 0, tab)
      this.actions.updatePanelsRanges()
    }
  }
  if (tab.pinned) this.actions.updatePanelsRanges()

  // Update tree
  if (this.state.tabsTree && !tab.pinned) {
    if (tab.openerTabId === undefined) {
      // Set tab tree level
      let nextTab = this.state.tabs[tab.index + 1]
      if (nextTab && tab.panelId === nextTab.panelId) {
        tab.parentId = nextTab.parentId
        tab.lvl = nextTab.lvl
      }
    } else {
      let parent = this.state.tabsMap[tab.openerTabId]
      if (parent && parent.panelId === tab.panelId && treeAllowed) {
        let insideBranch = false
        for (let t, i = parent.index + 1; i < this.state.tabs.length; i++) {
          t = this.state.tabs[i]
          insideBranch = t.id === tab.id
          if (insideBranch) break
          if (t.lvl <= parent.lvl) break
        }
        if (insideBranch) {
          tab.parentId = tab.openerTabId
          const start = panel.startIndex
          this.actions.updateTabsTree(start, tab.index + 1)
          if (this.state.autoFoldTabs && !parent.folded) {
            this.actions.expTabsBranch(tab.parentId)
          }
        } else {
          browser.tabs.update(tab.id, { openerTabId: tab.id })
        }
      }
    }

    if (this.state.stateStorage === 'global') this.actions.saveTabsData()
    if (this.state.stateStorage === 'session') this.actions.saveTabData(tab)

    const groupTab = this.actions.getGroupTab(tab)
    if (groupTab && !groupTab.discarded) {
      browser.tabs
        .sendMessage(groupTab.id, {
          name: 'create',
          id: tab.id,
          index: tab.index,
          lvl: tab.lvl - groupTab.lvl - 1,
          title: tab.title,
          url: tab.url,
          discarded: tab.discarded,
          favIconUrl: tab.favIconUrl,
        })
        .catch(() => {
          /** itsokay **/
        })
    }
  }

  // Update succession
  if (this.state.activateAfterClosing !== 'none') {
    const activeTab = this.state.tabsMap[this.state.activeTabId]
    if (activeTab && activeTab.active) {
      const target = Utils.findSuccessorTab(this.state, activeTab)
      if (target) browser.tabs.moveInSuccession([activeTab.id], target.id)
    }
  }

  if (this.state.stateStorage === 'session' && tab.url.startsWith(GROUP_URL)) {
    this.state.groupTabs[tab.id] = true
    this.actions.saveGroups()
  }

  this.actions.recalcPanelScroll()
}

/**
 * tabs.onUpdated
 */
function onTabUpdated(tabId, change, tab) {
  if (tab.windowId !== this.state.windowId) return

  const localTab = this.state.tabsMap[tabId]
  if (!localTab) return

  // Discarded
  if (change.discarded !== undefined && change.discarded) {
    if (localTab.status === 'loading') localTab.status = 'complete'
    if (localTab.loading) localTab.loading = false
  }

  // Status change
  if (change.status !== undefined) {
    if (change.status === 'complete' && !tab.url.startsWith('about')) {
      browser.tabs
        .get(localTab.id)
        .then(tabInfo => {
          if (tabInfo.favIconUrl && !tabInfo.favIconUrl.startsWith('chrome:')) {
            localTab.favIconUrl = tabInfo.favIconUrl
          } else {
            if (tabInfo.favIconUrl === 'chrome://global/skin/icons/warning.svg') {
              localTab.warn = true
            } else if (localTab.warn) {
              localTab.warn = false
            }
            localTab.favIconUrl = ''
          }

          let groupTab = this.actions.getGroupTab(localTab)
          if (groupTab && !groupTab.discarded) {
            let updateData = {
              name: 'updateTab',
              id: tab.id,
              status: change.status,
              title: tab.title,
              url: tab.url,
              lvl: localTab.lvl - groupTab.lvl - 1,
              discarded: localTab.discarded,
              favIconUrl:
                localTab.favIconUrl || this.state.favicons[this.state.favUrls[localTab.url]],
            }
            browser.tabs.sendMessage(groupTab.id, updateData).catch(() => {
              /** itsokay **/
            })
          }
        })
        .catch(() => {
          // If I close containered tab opened from bg script
          // I'll get 'updated' event with 'status': 'complete'
          // and since tab is in 'removing' state I'll get this
          // error.
        })
    }
  }

  // Url
  if (change.url !== undefined) {
    if (change.url !== localTab.url) {
      if (this.state.stateStorage === 'global') this.actions.saveTabsData()
      if (this.state.highlightOpenBookmarks && this.state.bookmarksUrlMap) {
        if (this.state.bookmarksUrlMap[localTab.url]) {
          for (let b of this.state.bookmarksUrlMap[localTab.url]) {
            b.isOpen = false
          }
        }
        if (this.state.bookmarksUrlMap[change.url]) {
          for (let b of this.state.bookmarksUrlMap[change.url]) {
            b.isOpen = true
          }
        }
      }
      if (!change.url.startsWith(localTab.url.slice(0, 16))) {
        localTab.favIconUrl = ''
      }
      if (this.state.stateStorage === 'session') {
        if (change.url.startsWith(GROUP_URL)) {
          this.state.groupTabs[localTab.id] = true
          this.actions.saveGroups()
        } else if (this.state.groupTabs[localTab.id]) {
          this.state.groupTabs[localTab.id] = false
        }
      }
      if (
        this.state.urlRules &&
        this.state.urlRules.length &&
        !localTab.pinned &&
        localTab.panelId &&
        change.url !== 'about:blank'
      ) {
        this.actions.checkUrlRules(change.url, localTab)
      }
    }
  }

  // Handle favicon change
  // If favicon is base64 string - store it in cache
  if (change.favIconUrl) {
    if (change.favIconUrl.startsWith('data:')) {
      this.actions.setFavicon(tab.url, change.favIconUrl)
    } else if (change.favIconUrl.startsWith('chrome:')) {
      if (change.favIconUrl === 'chrome://global/skin/icons/warning.svg') {
        localTab.warn = true
      }
      change.favIconUrl = ''
    }
  }

  let inact = Date.now() - tab.lastAccessed
  if (change.title !== undefined && !tab.active && inact > 5000) {
    // If prev url starts with 'http' and current url same as prev
    if (localTab.url.startsWith('http') && localTab.url === tab.url) {
      // and if title doesn't looks like url
      if (!URL_HOST_PATH_RE.test(localTab.title) && !URL_HOST_PATH_RE.test(tab.title)) {
        let panel = this.state.panelsMap[localTab.panelId]
        localTab.updated = true
        if (!tab.pinned || this.state.pinnedTabsPosition === 'panel') {
          if (!panel.updated.includes(tabId)) panel.updated.push(tabId)
        }
      }
    }
  }

  // Update tab object
  Object.assign(localTab, change)

  // Handle unpinned tab
  if (change.pinned !== undefined && !change.pinned) {
    let panel = this.state.panelsMap[localTab.panelId]
    if (!panel) return
    if (!localTab.unpinning) {
      localTab.destPanelId = localTab.panelId
      this.state.tabs.splice(localTab.index, 1)
      this.state.tabs.splice(panel.startIndex - 1, 0, localTab)
      panel.tabs.splice(0, 0, localTab)
      this.actions.updateTabsIndexes()
      if (panel && panel.tabs) browser.tabs.move(tabId, { index: panel.startIndex - 1 })
      this.actions.updatePanelsRanges()
    }
    if (tab.active) this.actions.setPanel(panel.index)
  }

  // Handle pinned tab
  if (change.pinned !== undefined && change.pinned) {
    let panel = this.state.panelsMap[localTab.panelId]
    let index = localTab.index - panel.startIndex
    if (panel.tabs[index] && panel.tabs[index].id === localTab.id) {
      panel.tabs.splice(index, 1)
    }

    if (localTab.prevPanelId && localTab.moveTime) {
      if (localTab.moveTime + 1000 > Date.now()) {
        localTab.panelId = localTab.prevPanelId
        panel = this.state.panelsMap[localTab.panelId]
        if (this.state.stateStorage === 'session') this.actions.saveTabData(localTab)
      }
    }

    this.actions.updatePanelsRanges()
    this.actions.updateTabsTree()
    if (!panel.tabs.length) {
      if (panel.noEmpty) {
        this.actions.createTabInPanel(panel)
      } else if (this.state.pinnedTabsPosition !== 'panel') {
        this.actions.switchToNeighbourPanel()
      }
    }
  }
}

/**
 * tabs.onRemoved
 */
function onTabRemoved(tabId, info, childfree) {
  if (info.windowId !== this.state.windowId) return
  if (info.isWindowClosing) return

  if (!this.state.removingTabs) this.state.removingTabs = []
  else this.state.removingTabs.splice(this.state.removingTabs.indexOf(tabId), 1)

  if (!this.state.removingTabs.length) {
    this.actions.closeCtxMenu()
    this.actions.resetSelection()
  }

  // Try to get removed tab and its panel
  let tab = this.state.tabsMap[tabId]
  if (!tab) return
  let creatingNewTab
  let panel = this.state.panelsMap[tab.panelId]

  // Recreate locked tab
  if (!tab.pinned && panel && panel.lockedTabs && tab.url.startsWith('http')) {
    if (!this.state.newTabsPosition) this.state.newTabsPosition = {}
    this.state.newTabsPosition[tab.index] = {
      parent: tab.parentId,
      panel: panel.id,
    }
    browser.tabs.create({
      windowId: this.state.windowId,
      index: tab.index,
      url: tab.url,
      openerTabId: tab.parentId > -1 ? tab.parentId : undefined,
      cookieStoreId: tab.cookieStoreId,
    })
    creatingNewTab = true
  }

  // Handle child tabs
  if (this.state.tabsTree && tab.isParent && !childfree) {
    const toRemove = []
    for (let i = tab.index + 1; i < this.state.tabs.length; i++) {
      const t = this.state.tabs[i]
      if (t.lvl <= tab.lvl) break

      // Remove folded tabs
      if ((this.state.rmChildTabs === 'folded' && tab.folded) || this.state.rmChildTabs === 'all') {
        if (!this.state.removingTabs.includes(t.id)) toRemove.push(t.id)
      }

      // Down level
      if (t.parentId === tab.id) t.parentId = tab.parentId
    }

    // Remove child tabs
    if (this.state.rmChildTabs !== 'none' && toRemove.length) {
      this.actions.removeTabs(toRemove)
    }
  }

  // Update last active tab if needed
  if (tab.active && panel && panel.lastActiveTab >= 0) {
    panel.lastActiveTab = -1
  }

  // Shift tabs after removed one. (NOT detected by vue)
  for (let i = tab.index + 1; i < this.state.tabs.length; i++) {
    this.state.tabs[i].index--
  }
  this.state.tabsMap[tabId] = undefined
  this.state.tabs.splice(tab.index, 1)

  // Remove tab from panel
  if (panel && panel.tabs) {
    if (!tab.pinned) panel.tabs.splice(tab.index - panel.startIndex, 1)
    this.actions.updatePanelsRanges()
  }

  // No-empty
  if (!tab.pinned && panel && panel.noEmpty && panel.tabs && !panel.tabs.length) {
    if (!creatingNewTab) {
      this.actions.createTabInPanel(panel)
    }
  }

  // Remove updated flag
  if (panel && panel.tabs) {
    let i = panel.updated.indexOf(tabId)
    panel.updated.splice(i, 1)
  }

  // On removing the last tab
  if (!this.state.removingTabs.length) {
    this.actions.recalcPanelScroll()

    // Update tree
    if (this.state.tabsTree) {
      const startIndex = panel ? panel.startIndex : 0
      const endIndex = panel ? panel.endIndex + 1 : -1
      this.actions.updateTabsTree(startIndex, endIndex)
    }

    // Save new tabs state
    if (this.state.stateStorage === 'global') this.actions.saveTabsData()
    if (this.state.stateStorage === 'session') this.actions.saveGroups()

    // Update succession
    if (this.state.activateAfterClosing !== 'none') {
      const activeTab = this.state.tabsMap[this.state.activeTabId]
      if (activeTab && activeTab.active) {
        const target = Utils.findSuccessorTab(this.state, activeTab)
        if (target) browser.tabs.moveInSuccession([activeTab.id], target.id)
      }
    }
  }

  // Remove isOpen flag from bookmark
  if (
    this.state.highlightOpenBookmarks &&
    this.state.bookmarksUrlMap &&
    this.state.bookmarksUrlMap[tab.url]
  ) {
    let tabWithSameUrl = this.state.tabs.find(t => t.url === tab.url)
    if (!tabWithSameUrl) {
      for (let b of this.state.bookmarksUrlMap[tab.url]) {
        b.isOpen = false
      }
    }
  }

  const groupTab = this.actions.getGroupTab(tab)
  if (groupTab && !groupTab.discarded) {
    browser.tabs.sendMessage(groupTab.id, { name: 'remove', id: tab.id }).catch(() => {
      /** itsokay **/
    })
  }
}

/**
 * tabs.onMoved
 */
function onTabMoved(id, info) {
  if (info.windowId !== this.state.windowId) return
  if (this.state.ignoreMovingTabs) return

  if (!this.state.movingTabs) this.state.movingTabs = []
  else this.state.movingTabs.splice(this.state.movingTabs.indexOf(id), 1)
  let mvLen = this.state.movingTabs.length

  if (!mvLen) {
    this.actions.closeCtxMenu()
    this.actions.resetSelection()
  }

  // Check if target tab already placed
  let toIndex = info.toIndex
  if (info.toIndex > info.fromIndex) toIndex = toIndex - mvLen
  let tabAtTargetPlace = this.state.tabs[toIndex]
  if (tabAtTargetPlace && tabAtTargetPlace.id === id) {
    if (this.state.stateStorage === 'global' && !this.state.movingTabs.length) {
      this.actions.saveTabsData()
    }
    if (this.state.stateStorage === 'session') this.actions.saveTabData(id)
    return
  }

  if (this.state.tabsMap[id] && this.state.tabsMap[id].unpinning) return

  // Move tab in tabs array
  let movedTab = this.state.tabs.splice(info.fromIndex, 1)[0]
  if (!movedTab || movedTab.id !== id) {
    const i = this.state.tabs.findIndex(t => t.id === id)
    movedTab = this.state.tabs.splice(i, 1)[0]
  }
  if (!movedTab) return

  movedTab.moveTime = Date.now()
  movedTab.prevPanelId = movedTab.panelId

  this.state.tabs.splice(info.toIndex, 0, movedTab)
  this.actions.recalcPanelScroll()

  // Update tabs indexes.
  const minIndex = Math.min(info.fromIndex, info.toIndex)
  const maxIndex = Math.max(info.fromIndex, info.toIndex)
  this.actions.updateTabsIndexes(minIndex, maxIndex + 1)

  // Move tab in panel
  let srcPanel
  let destPanel
  if (!movedTab.pinned) {
    srcPanel = this.state.panelsMap[movedTab.panelId]
    destPanel = this.state.panelsMap[movedTab.destPanelId]
    movedTab.destPanelId = undefined
    if (
      !destPanel ||
      destPanel.startIndex > info.toIndex ||
      destPanel.endIndex + 1 < info.toIndex
    ) {
      destPanel = this.state.panels.find(p => {
        return info.toIndex >= p.startIndex && info.toIndex <= p.endIndex + 1
      })
    }

    if (srcPanel && srcPanel.tabs && destPanel && destPanel.tabs) {
      let t = srcPanel.tabs[info.fromIndex - srcPanel.startIndex]
      if (t && t.id === movedTab.id) {
        srcPanel.tabs.splice(info.fromIndex - srcPanel.startIndex, 1)
      }
      let panelIndex = info.toIndex - destPanel.startIndex
      if (srcPanel !== destPanel) {
        srcPanel.lastActiveTab = null
        if (srcPanel.index < destPanel.index) panelIndex++
      }
      destPanel.tabs.splice(panelIndex, 0, movedTab)
      movedTab.panelId = destPanel.id
      this.actions.updatePanelsRanges()
    }
  }

  // Calc tree levels
  if (this.state.tabsTree && !this.state.movingTabs.length) {
    let a = 0
    let b = -1

    if (srcPanel && srcPanel.tabs && destPanel && destPanel.tabs) {
      let aIndex = Math.min(srcPanel.index, destPanel.index)
      let bIndex = Math.max(srcPanel.index, destPanel.index)
      let aPanel = this.state.panels[aIndex]
      let bPanel = this.state.panels[bIndex]
      a = aPanel.startIndex
      b = bPanel.tabs.length ? bPanel.endIndex + 1 : bPanel.endIndex
    }

    this.actions.updateTabsTree(a, b)
  }

  if (this.state.stateStorage === 'global' && !this.state.movingTabs.length) {
    this.actions.saveTabsData()
  }
  if (this.state.stateStorage === 'session') this.actions.saveTabData(movedTab)

  // Update succession
  if (!this.state.movingTabs.length && this.state.activateAfterClosing !== 'none') {
    const activeTab = this.state.tabsMap[this.state.activeTabId]
    if (activeTab && activeTab.active) {
      const target = Utils.findSuccessorTab(this.state, activeTab)
      if (target) browser.tabs.moveInSuccession([activeTab.id], target.id)
    }
  }
}

/**
 * tabs.onDetached
 */
function onTabDetached(id, info) {
  if (info.oldWindowId !== this.state.windowId) return
  const tab = this.state.tabsMap[id]
  if (tab) tab.folded = false
  this.handlers.onTabRemoved(id, { windowId: this.state.windowId }, true)
}

/**
 * tabs.onAttached
 */
async function onTabAttached(id, info) {
  if (info.newWindowId !== this.state.windowId) return

  if (!this.state.attachingTabs) this.state.attachingTabs = []
  const ai = this.state.attachingTabs.findIndex(t => t.id === id)

  let tab
  if (ai > -1) {
    tab = this.state.attachingTabs.splice(ai, 1)[0]
  } else {
    tab = await browser.tabs.get(id)
  }

  tab.windowId = this.state.windowId
  tab.index = info.newPosition

  this.handlers.onTabCreated(tab)

  if (tab.active) browser.tabs.update(tab.id, { active: true })
}

/**
 * tabs.onActivated
 */
function onTabActivated(info) {
  if (info.windowId !== this.state.windowId) return

  const currentPanel = this.state.panels[this.state.panelIndex]

  // Reset selection
  if (!this.state.dragNodes) this.actions.resetSelection()

  // Update previous active tab and store his id
  let prevActive = this.state.tabsMap[info.previousTabId]
  if (prevActive) {
    prevActive.active = false

    let box = this.state
    if (!box.actTabs) box.actTabs = []
    if (box.actTabs.length > 128) box.actTabs = box.actTabs.slice(32)
    box.actTabs.push(prevActive.id)

    box = this.state.panelsMap[prevActive.panelId]
    if (!box.actTabs) box.actTabs = []
    if (box.actTabs.length > 128) box.actTabs = box.actTabs.slice(32)
    box.actTabs.push(prevActive.id)
  }

  // Update tabs and find activated one
  let tab = this.state.tabsMap[info.tabId]
  if (!tab) return
  tab.active = true
  tab.lastAccessed = Date.now()
  this.state.activeTabId = info.tabId

  // Remove updated flag
  tab.updated = false
  let panel = this.state.panelsMap[tab.panelId]
  if (panel) {
    let i = panel.updated.indexOf(tab.id)
    panel.updated.splice(i, 1)
  }

  // Find panel of activated tab
  if (!panel) return

  // Switch to activated tab's panel
  if (!tab.pinned && (!currentPanel || !currentPanel.lockedPanel)) {
    this.actions.setPanel(panel.index)
  }

  // Auto expand tabs group
  if (this.state.autoExpandTabs && tab.isParent && tab.folded && !this.dragMode) {
    let prevActiveChild
    for (let i = tab.index + 1; i < this.state.tabs.length; i++) {
      if (this.state.tabs[i].lvl <= tab.lvl) break
      if (this.state.tabs[i].id === info.previousTabId) {
        prevActiveChild = true
        break
      }
    }
    if (!prevActiveChild) this.actions.expTabsBranch(tab.id)
  }
  if (tab.invisible) {
    this.actions.expTabsBranch(tab.parentId)
  }

  panel.lastActiveTab = info.tabId
  if (!tab.pinned) this.eventBus.$emit('scrollToTab', panel.index, info.tabId)

  // Update succession
  if (this.state.activateAfterClosing !== 'none') {
    const target = Utils.findSuccessorTab(this.state, tab)
    if (target && tab.successorTabId !== target.id) {
      browser.tabs.moveInSuccession([tab.id], target.id)
    }
  }

  if (this.state.tabsTree && Utils.isGroupUrl(tab.url)) {
    this.actions.updateGroupTab(tab)
  } else {
    this.actions.resetUpdateGroupTabTimeout()
  }
}

/**
 * Setup listeners
 */
function setupTabsListeners() {
  browser.tabs.onCreated.addListener(this.handlers.onTabCreated)
  browser.tabs.onUpdated.addListener(this.handlers.onTabUpdated, {
    properties: [
      'audible',
      'discarded',
      'favIconUrl',
      'hidden',
      'mutedInfo',
      'pinned',
      'status',
      'title',
    ],
  })
  browser.tabs.onRemoved.addListener(this.handlers.onTabRemoved)
  browser.tabs.onMoved.addListener(this.handlers.onTabMoved)
  browser.tabs.onDetached.addListener(this.handlers.onTabDetached)
  browser.tabs.onAttached.addListener(this.handlers.onTabAttached)
  browser.tabs.onActivated.addListener(this.handlers.onTabActivated)
}

/**
 * Remove listeners
 */
function resetTabsListeners() {
  browser.tabs.onCreated.removeListener(this.handlers.onTabCreated)
  browser.tabs.onUpdated.removeListener(this.handlers.onTabUpdated)
  browser.tabs.onRemoved.removeListener(this.handlers.onTabRemoved)
  browser.tabs.onMoved.removeListener(this.handlers.onTabMoved)
  browser.tabs.onDetached.removeListener(this.handlers.onTabDetached)
  browser.tabs.onAttached.removeListener(this.handlers.onTabAttached)
  browser.tabs.onActivated.removeListener(this.handlers.onTabActivated)
}

export default {
  onTabCreated,
  onTabUpdated,
  onTabRemoved,
  onTabMoved,
  onTabAttached,
  onTabDetached,
  onTabActivated,
  setupTabsListeners,
  resetTabsListeners,
}
