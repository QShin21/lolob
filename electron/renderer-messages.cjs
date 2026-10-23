function createRendererMessenger({ getWindow, trusted }) {
  return (channel, value) => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return false;
    let contents;
    try {
      contents = window.webContents;
      if (!contents || contents.isDestroyed() || !trusted(contents)) return false;
      contents.send(channel, value);
      return true;
    } catch (error) {
      if (window.isDestroyed() || contents?.isDestroyed()) return false;
      throw error;
    }
  };
}
module.exports = { createRendererMessenger };
