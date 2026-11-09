// Paste this entire file into Firefox's Web Console on chatgpt.com.
(() => {
  "use strict";

  if (!["chatgpt.com", "chat.openai.com"].includes(location.hostname)) {
    throw new Error("Open ChatGPT before installing chatDelete.");
  }
  window.chatDelete?.stop?.();

  const SIDEBAR = '#history, #stage-sidebar, #stage-slideover-sidebar, [data-testid="sidebar"], nav[aria-label="Chat history"]';
  const DIALOG = '[role="dialog"], [role="alertdialog"], dialog[open]';
  const MENU = '[role="menu"]';
  const TIMEOUT = 5000;
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const visible = (el) => el.isConnected && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden" && !el.closest('[aria-hidden="true"], [inert]');
  const shown = (selector, root = document) => [...root.querySelectorAll(selector)].filter(visible);
  const chatPath = (link) => {
    try {
      const url = new URL(link.href, location.href);
      return url.origin === location.origin && /^\/(?:g\/[^/]+\/)?c\/[^/]+\/?$/.test(url.pathname)
        ? url.pathname.replace(/\/$/, "") : null;
    } catch { return null; }
  };
  const isDelete = (el) => /^delete(?: chat| conversation)?[.\u2026?]*$/i.test(
    clean(el.getAttribute("aria-label") || el.textContent)
  );
  const enabled = (el) => !el.disabled && el.getAttribute("aria-disabled") !== "true";
  let active = null;
  let installed = true;

  // Observe actual DOM changes rather than assuming a fixed network/UI delay.
  function waitFor(check, description, signal) {
    return new Promise((resolve, reject) => {
      let timer, poll, observer;
      const finish = (error, value) => {
        clearTimeout(timer);
        clearInterval(poll);
        observer?.disconnect();
        signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(new DOMException("Stopped", "AbortError"));
      const inspect = () => {
        if (signal.aborted) return abort();
        try { const result = check(); if (result) finish(null, result); }
        catch (error) { finish(error); }
      };
      observer = new MutationObserver(inspect);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => finish(new Error(`Timed out waiting for ${description}. No further clicks made.`)), TIMEOUT);
      poll = setInterval(inspect, 50);
      inspect();
    });
  }

  function one(elements, description) {
    if (elements.length > 1) throw new Error(`More than one ${description}; stopped without guessing.`);
    return elements[0];
  }

  function findTrigger(link, sidebar, path) {
    for (let row = link; row && row !== sidebar; row = row.parentElement) {
      const paths = new Set([...row.querySelectorAll('a[href]')].map(chatPath).filter(Boolean));
      if (paths.size > 1 || (paths.size && !paths.has(path))) break;
      const buttons = [...row.querySelectorAll('button, [role="button"]')].filter((button) =>
        enabled(button) && (button.getAttribute("aria-haspopup") === "menu" ||
          /(?:conversation.*options|options.*conversation|more|options)/i.test(button.getAttribute("aria-label") || "") ||
          /history-item.*options/.test(button.getAttribute("data-testid") || ""))
      );
      const trigger = one(buttons, "conversation menu button");
      if (trigger) return trigger;
    }
    throw new Error("Could not identify this conversation's menu button. ChatGPT's markup may have changed.");
  }

  async function remove(link, sidebar, signal) {
    const path = chatPath(link);
    const titleNode = link.querySelector('[data-testid="conversation-title"], [dir="auto"]');
    const title = clean(titleNode?.textContent || link.getAttribute("title") || link.textContent);
    if (!title) throw new Error("Could not read the selected conversation's title.");
    if (shown(MENU).length || shown(DIALOG).length) {
      throw new Error("Close the existing menu or dialog, then right-click the conversation again.");
    }
    const trigger = findTrigger(link, sidebar, path);
    const click = (element) => {
      signal.throwIfAborted();
      if (!element.isConnected || !enabled(element)) throw new Error("The target control is no longer available.");
      element.click();
    };
    console.info(`[chatDelete] Deleting: ${title}`);

    // Radix-style menus open on pointerdown; other menus open on click.
    signal.throwIfAborted();
    const Pointer = window.PointerEvent || window.MouseEvent;
    trigger.dispatchEvent(new Pointer("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    trigger.dispatchEvent(new Pointer("pointerup", { bubbles: true, cancelable: true, button: 0, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    await Promise.resolve();
    signal.throwIfAborted();
    if (!shown(MENU).length && trigger.getAttribute("aria-expanded") !== "true") click(trigger);

    const menu = await waitFor(() => {
      const controlled = document.getElementById(trigger.getAttribute("aria-controls"));
      if (controlled?.matches(MENU) && visible(controlled)) return controlled;
      return one(shown(MENU), "open conversation menu");
    }, "the conversation menu", signal);
    const deleteItem = await waitFor(() => one(
      shown('[role="menuitem"], button', menu).filter((el) => isDelete(el) && enabled(el)),
      "Delete menu item"
    ), "the Delete menu item", signal);
    if (shown(DIALOG).length) throw new Error("An unexpected dialog appeared; stopped.");
    click(deleteItem);

    const dialog = await waitFor(() => {
      const candidate = one(shown(DIALOG), "confirmation dialog");
      if (!candidate) return null;
      const headings = [...candidate.querySelectorAll('h1, h2, h3, [role="heading"]')];
      const labelled = (candidate.getAttribute("aria-labelledby") || "").split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "").join(" ");
      const heading = clean(labelled || candidate.getAttribute("aria-label") || headings.map((h) => h.textContent).join(" "));
      if (!/\bdelete\b/i.test(heading) || !clean(candidate.textContent).includes(title)) return null;
      return candidate;
    }, `a deletion dialog naming “${title}”`, signal);
    const confirm = await waitFor(() => one(
      shown('button, [role="button"]', dialog).filter((el) => isDelete(el) && enabled(el)),
      "Delete confirmation button"
    ), "the Delete confirmation button", signal);
    if (!visible(dialog) || !clean(dialog.textContent).includes(title)) throw new Error("The confirmation dialog changed; stopped.");
    click(confirm);
    await waitFor(() => !visible(dialog) && ![...document.querySelectorAll(`${SIDEBAR.split(', ').map((s) => `${s} a[href]`).join(', ')}`)]
      .some((a) => chatPath(a) === path), "the dialog to close and the sidebar entry to disappear", signal);
    console.info(`[chatDelete] Removed from the sidebar: ${title}`);
  }

  function onContextMenu(event) {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const sidebar = link?.closest(SIDEBAR);
    if (!installed || !sidebar || !chatPath(link)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (active) { console.info("[chatDelete] Busy; wait for the current operation."); return; }
    const controller = new AbortController();
    active = controller;
    remove(link, sidebar, controller.signal)
      .catch((error) => {
        if (error.name !== "AbortError") console.error("[chatDelete]", error.message);
      })
      .finally(() => { if (active === controller) active = null; });
  }

  window.chatDelete = Object.freeze({
    stop() {
      installed = false;
      document.removeEventListener("contextmenu", onContextMenu, true);
      active?.abort();
      active = null;
      console.info("[chatDelete] Disabled. Any deletion already submitted cannot be cancelled.");
    },
    get busy() { return active !== null; }
  });
  document.addEventListener("contextmenu", onContextMenu, true);
  console.info("[chatDelete] Enabled: right-click a sidebar conversation to delete and confirm automatically. Disable with chatDelete.stop().");
})();
