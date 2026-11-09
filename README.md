# ChatGPT right-click deletion

A Firefox console script that deletes a ChatGPT conversation when you right-click it in the sidebar.

## Usage

1. Open ChatGPT in Firefox with the sidebar expanded and the interface set to English.
2. Open [chat-delete.js](chat-delete.js) and copy its contents. On GitHub, use **Raw** or **Copy raw file**.
3. Open Firefox's Web Console with **Ctrl+Shift+K** (**Cmd+Option+K** on macOS).
4. Paste the script into the console and press **Enter**.
5. Right-click a conversation in the sidebar to delete it. The script confirms deletion automatically.
6. Wait for the conversation to disappear, then keep right-clicking other conversations you want to delete. You only need to paste the script once.
7. **Refresh the page to remove the script and restore normal right-click behaviour.**

**Right-clicking deletes the selected conversation and confirms the deletion automatically.** Each deletion requires a right-click; there is no automatic bulk deletion.

## Stop

**Refresh the page to remove the script.**

To disable it without refreshing, run this in the console:

```js
chatDelete.stop()
```

Stopping cancels pending clicks. It cannot undo a deletion already submitted.

## Behaviour

- Runs in the current tab with no extension, API key or runtime dependencies.
- Handles one conversation at a time and ignores further conversation right-clicks while busy.
- Leaves right-clicks outside the conversation list unchanged.
- Replaces the previous handler if you paste the script again.

## Troubleshooting

If a step takes more than five seconds or a control cannot be identified, the script stops that operation and logs an error in the console. Close any open menu or dialog before trying again.

The confirmation dialog must name the selected conversation. Changes to ChatGPT's layout or interface language may prevent the script from finding the controls.

## Tests

The [tests](test/chat-delete.test.cjs) use jsdom to check selection, confirmation, timeouts and cancellation. To run them locally with Node.js and npm:

```sh
npm install --no-save --package-lock=false jsdom@26.1.0
node --test test/chat-delete.test.cjs
```
