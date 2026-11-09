const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync(path.join(__dirname, '..', 'chat-delete.js'), 'utf8');
const pause = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(options = {}) {
  const dom = new JSDOM(`<!doctype html><nav id="history">
    <div id="row-a"><a href="/c/a"><span dir="auto">First chat</span></a><button aria-label="Open conversation options" aria-haspopup="menu">...</button></div>
    <div id="row-b"><a href="/c/b"><span dir="auto">Second chat</span></a><button aria-label="Open conversation options" aria-haspopup="menu">...</button></div>
    </nav><main><a href="/c/outside">Outside</a></main>`, {
    url: 'https://chatgpt.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window: w } = dom;
  const errors = [], deleted = [], opened = [];
  w.console.info = () => {};
  w.console.error = (...args) => errors.push(args.join(' '));
  // jsdom has no layout engine. Explicitly model rendered vs hidden elements.
  w.HTMLElement.prototype.getClientRects = function () {
    return this.isConnected && !this.closest('[hidden]') ? [{}] : [];
  };
  for (const row of w.document.querySelectorAll('nav > div')) {
    const trigger = row.querySelector('button');
    trigger.addEventListener(options.pointer ? 'pointerdown' : 'click', () => {
      opened.push(row.id);
      trigger.setAttribute('aria-expanded', 'true');
      w.setTimeout(() => {
        const menu = w.document.createElement('div');
        menu.setAttribute('role', 'menu');
        menu.innerHTML = options.noDelete ? '<button role="menuitem">Archive</button>' : '<button role="menuitem">Delete</button>';
        w.document.body.append(menu);
        menu.querySelector('button').onclick = () => {
          menu.remove();
          trigger.setAttribute('aria-expanded', 'false');
          w.setTimeout(() => {
            const dialog = w.document.createElement('div');
            dialog.setAttribute('role', 'dialog');
            const title = options.wrongTitle ? 'Unrelated chat' : row.querySelector('a').textContent;
            dialog.innerHTML = `<h2>Delete chat?</h2><p>This will delete ${title}.</p><button>Cancel</button><button>Delete</button>`;
            w.document.body.append(dialog);
            dialog.lastElementChild.onclick = () => {
              deleted.push(row.id);
              row.remove();
              dialog.remove();
            };
          }, options.dialogDelay || 0);
        };
      }, options.menuDelay || 0);
    });
  }
  const install = () => w.eval(script);
  const rightClick = (selector) => {
    const event = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    w.document.querySelector(selector).dispatchEvent(event);
    return event;
  };
  install();
  return { w, errors, deleted, opened, install, rightClick, close: () => w.close() };
}

test('deletes only the selected conversation and confirms', async () => {
  const f = setup();
  try {
    assert.equal(f.rightClick('#row-b span').defaultPrevented, true);
    await pause(100);
    assert.deepEqual(f.deleted, ['row-b']);
    assert.ok(f.w.document.querySelector('#row-a'));
    assert.equal(f.w.chatDelete.busy, false);
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test('waits for delayed pointer-driven menus and dialogs; ignores extra requests', async () => {
  const f = setup({ pointer: true, menuDelay: 60, dialogDelay: 60 });
  try {
    f.rightClick('#row-a a');
    f.rightClick('#row-b a');
    await pause(250);
    assert.deepEqual(f.opened, ['row-a']);
    assert.deepEqual(f.deleted, ['row-a']);
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test('does not intercept conversation links outside the sidebar', () => {
  const f = setup();
  try {
    assert.equal(f.rightClick('main a').defaultPrevented, false);
    assert.deepEqual(f.opened, []);
  } finally { f.close(); }
});

test('reinstallation leaves a single handler', async () => {
  const f = setup();
  try {
    f.install();
    f.install();
    f.rightClick('#row-a a');
    await pause(100);
    assert.deepEqual(f.opened, ['row-a']);
    assert.deepEqual(f.deleted, ['row-a']);
  } finally { f.close(); }
});

test('stop cancels pending confirmation and removes the handler', async () => {
  const f = setup({ dialogDelay: 100 });
  try {
    f.rightClick('#row-a a');
    await pause(30);
    f.w.chatDelete.stop();
    await pause(150);
    assert.deepEqual(f.deleted, []);
    assert.equal(f.rightClick('#row-b a').defaultPrevented, false);
    assert.equal(f.w.chatDelete.busy, false);
  } finally { f.close(); }
});

test('existing unrelated dialogs block all menu clicks', async () => {
  const f = setup();
  try {
    f.w.document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><h2>Delete account?</h2><button>Delete</button></div>');
    f.rightClick('#row-a a');
    await pause();
    assert.deepEqual(f.opened, []);
    assert.deepEqual(f.deleted, []);
    assert.match(f.errors[0], /existing menu or dialog/);
  } finally { f.close(); }
});

test('wrong conversation in the dialog times out without confirmation', async () => {
  const f = setup({ wrongTitle: true });
  try {
    f.rightClick('#row-a a');
    await pause(5250);
    assert.deepEqual(f.deleted, []);
    assert.equal(f.w.chatDelete.busy, false);
    assert.match(f.errors[0], /Timed out waiting for a deletion dialog/);
  } finally { f.close(); }
});

test('missing Delete control times out without clicking another action', async () => {
  const f = setup({ noDelete: true });
  try {
    f.rightClick('#row-a a');
    await pause(5250);
    assert.deepEqual(f.deleted, []);
    assert.equal(f.w.chatDelete.busy, false);
    assert.match(f.errors[0], /Timed out waiting for the Delete menu item/);
  } finally { f.close(); }
});

test('ambiguous menu buttons fail without opening either menu', async () => {
  const f = setup();
  try {
    f.w.document.querySelector('#row-a').insertAdjacentHTML('beforeend', '<button aria-haspopup="menu">Another menu</button>');
    f.rightClick('#row-a a');
    await pause();
    assert.deepEqual(f.opened, []);
    assert.match(f.errors[0], /More than one conversation menu button/);
  } finally { f.close(); }
});
