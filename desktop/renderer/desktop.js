(() => {
  const desktop = window.whaleDesktop
  let pointerDown = false
  let interactive = false
  let lastPoint = { x: -1, y: -1 }
  function update(point = lastPoint) {
    lastPoint = point
    const hit = pointerDown || !!document.querySelector('#dshw-desktop-panel') ||
      !!(window.dshwDesktopHitTest && window.dshwDesktopHitTest(point.x, point.y))
    if (hit !== interactive) { interactive = hit; desktop.setInteractive(hit) }
  }
  // Main-process cursor polling also works when Windows sends the pointer to
  // another app. It closes the re-entry gap of mousemove-only click-through.
  desktop.onCursor(update)
  document.addEventListener('pointermove', event => update({ x: event.clientX, y: event.clientY }), true)
  document.addEventListener('pointerdown', () => { pointerDown = true; desktop.focus(); update() }, true)
  document.addEventListener('pointerup', () => { pointerDown = false; update() }, true)
  document.addEventListener('pointercancel', () => { pointerDown = false; update() }, true)
  window.addEventListener('blur', () => { pointerDown = false; update() })
  desktop.onAction(action => {
    if (action === 'desktop-settings') openSettings().catch(showError)
    else if (window.dshwDesktopAction) window.dshwDesktopAction(action)
    update()
  })
  function showError(error) {
    const output = document.querySelector('.desktop-status')
    if (output) output.textContent = error.message || String(error)
    else console.error('桌面设置操作失败', error.message)
  }
  async function openSettings() {
    if (document.querySelector('#dshw-desktop-panel')) return
    const config = await desktop.settings()
    const mask = document.createElement('div')
    mask.id = 'dshw-desktop-panel'
    mask.innerHTML = '<div class="desktop-card"><h2>小鲸鱼 · 桌面设置</h2><p>角色、泡泡、音效与记账设置都在鲸鱼旁的 ☰ 菜单中。</p><label>DeepSeek API Key<input id="desktop-key" type="password" autocomplete="off" placeholder="留空保留已保存的密钥"></label><label>显示器<select id="desktop-display"></select></label><label class="check"><input id="desktop-top" type="checkbox">始终置顶</label><label class="check"><input id="desktop-startup" type="checkbox">登录 Windows 时启动</label><button id="desktop-import">导入旧桌面版 config.json</button><p>密钥通过 Windows 加密保存在当前用户的数据目录。可从托盘菜单打开数据目录。</p><div class="desktop-status" role="status"></div><div class="desktop-buttons"><button id="desktop-cancel">关闭</button><button id="desktop-save" class="primary">保存</button></div></div>'
    document.body.appendChild(mask)
    mask.querySelector('h2').insertAdjacentHTML('afterend', '<p>Windows 桌面移植 fork · 上游：<a href="https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget" target="_blank" rel="noopener">MeteorNOX/DeepSeek-Balance-Whale-Widget</a></p>')
    mask.querySelector('#desktop-key').closest('label').insertAdjacentHTML('afterend', '<label>OpenCode Go Key<input id="desktop-opencode-key" type="password" autocomplete="off" placeholder="留空保留已保存的密钥"></label><p>卡片、泡泡显示来源与卡片布局在「小肥鱼记账 → 显示项目」中设置。</p>')
    mask.querySelector('#desktop-opencode-key').placeholder = config.opencodeKeyConfigured ? '已配置 · 输入新密钥可替换' : 'OpenCode Go Console Key'
    for (const display of config.displays) {
      const option = new Option(display.label, String(display.id))
      mask.querySelector('select').add(option)
    }
    mask.querySelector('select').value = String(config.displayId)
    mask.querySelector('#desktop-top').checked = config.alwaysOnTop
    mask.querySelector('#desktop-startup').checked = config.openAtLogin
    mask.querySelector('#desktop-key').placeholder = config.keyConfigured ? '已配置 · 输入新密钥可替换' : 'sk-…'
    const close = () => { mask.remove(); update() }
    mask.querySelector('#desktop-cancel').onclick = close
    mask.addEventListener('click', e => { if (e.target === mask) close() })
    mask.querySelector('#desktop-save').onclick = async () => {
      const button = mask.querySelector('#desktop-save')
      button.disabled = true
      try {
        await desktop.saveSettings({
          displayId: Number(mask.querySelector('select').value),
          alwaysOnTop: mask.querySelector('#desktop-top').checked,
          openAtLogin: mask.querySelector('#desktop-startup').checked,
          key: mask.querySelector('#desktop-key').value,
          opencodeKey: mask.querySelector('#desktop-opencode-key').value
        })
        mask.querySelector('#desktop-key').value = ''
        mask.querySelector('#desktop-opencode-key').value = ''
        window.dispatchEvent(new Event('whale-desktop-settings-saved'))
        window.dshwDesktopAction?.('refresh')
        close()
      } catch (error) { showError(error) } finally { button.disabled = false }
    }
    mask.querySelector('#desktop-import').onclick = async () => {
      try {
        const result = await desktop.importLegacy()
        if (!result.canceled) {
          mask.querySelector('.desktop-status').textContent = '导入完成，正在重新加载完整挂件…'
          location.reload()
        }
      } catch (error) { showError(error) }
    }
    desktop.focus()
    update()
  }
  window.addEventListener('dshw-desktop-ready', async () => {
    update()
    const settings = await desktop.settings()
    if (!settings.onboarded) await openSettings()
  })
})()
