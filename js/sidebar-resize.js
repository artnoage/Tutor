// sidebar-resize.js
document.addEventListener('DOMContentLoaded', () => {
    const leftSidebar = document.getElementById('leftSidebar');
    const rightSidebar = document.getElementById('rightSidebar');
    const leftHandle = document.getElementById('leftResizeHandle');
    const rightHandle = document.getElementById('rightResizeHandle');
  
    let isResizing = false;
    let currentHandle = null;
  
    const startResize = (e, handle, sidebar) => {
      isResizing = true;
      currentHandle = handle;
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResize);
      e.preventDefault();
    };
  
    const resize = (e) => {
      if (!isResizing) return;
  
      if (currentHandle === leftHandle) {
        const newWidth = e.clientX;
        leftSidebar.style.width = `${newWidth}px`;
      } else if (currentHandle === rightHandle) {
        const newWidth = window.innerWidth - e.clientX;
        rightSidebar.style.width = `${newWidth}px`;
      }
    };
  
    const stopResize = () => {
      isResizing = false;
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResize);
    };
  
    leftHandle.addEventListener('mousedown', (e) => startResize(e, leftHandle, leftSidebar));
    rightHandle.addEventListener('mousedown', (e) => startResize(e, rightHandle, rightSidebar));
  });