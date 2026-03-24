(function () {
  var FAVORITES_KEY = 'soccer_favorite_videos';

  function render() {
    var list = document.getElementById('favorites-list');
    var empty = document.getElementById('favorites-empty');
    if (!list || !empty || typeof getFavorites !== 'function' || typeof buildVideoCard !== 'function') {
      return;
    }
    var items = getFavorites();
    list.innerHTML = '';
    if (items.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    items.forEach(function (activity) {
      list.appendChild(buildVideoCard(activity, { listContext: 'favorites' }));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === FAVORITES_KEY) render();
  });
})();
