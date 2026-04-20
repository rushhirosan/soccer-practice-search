// セキュリティ: CSRFトークンを保持する変数
let csrfToken = null;

// CSRFトークンを取得する関数
async function getCsrfToken() {
    if (csrfToken) {
        return csrfToken;
    }
    try {
        const response = await fetch('/get-csrf-token');
        const data = await response.json();
        csrfToken = data.csrf_token;
        return csrfToken;
    } catch (error) {
        console.error((typeof uiS === 'function' ? uiS('js_csrf_fetch_failed') : 'CSRF error'), error);
        return null;
    }
}

// キーボードショートカットの設定
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + K で検索入力欄にフォーカス
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select(); // 既存のテキストを選択
            }
        }
        
        // Esc キーで検索結果をクリア（検索入力欄にフォーカスがある場合）
        if (event.key === 'Escape') {
            const searchInput = document.getElementById('search-input');
            if (document.activeElement === searchInput) {
                searchInput.value = '';
                searchInput.blur();
            }
        }
    });
}

// フォーカス管理の改善
function setupFocusManagement() {
    // 検索入力欄でEnterキーを処理
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                search();
            }
        });
    }
    
    // 検索ボタンにフォーカスがある場合のEnterキー処理
    const searchButton = document.getElementById('search-button');
    if (searchButton) {
        searchButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                search();
            }
        });
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Content Loaded - Starting initialization");
    
    // セキュリティ: CSRFトークンを事前に取得
    await getCsrfToken();
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
        searchInput.placeholder = typeof uiS === 'function' ? uiS('js_search_placeholder') : 'キーワードで検索';
        searchInput.title = isMac
            ? (typeof uiS === 'function' ? uiS('js_search_input_title_mac') : 'Cmd+K でフォーカス、クリックで履歴')
            : (typeof uiS === 'function' ? uiS('js_search_input_title_pc') : 'Ctrl+K でフォーカス、クリックで履歴');
        const shortcutKbd = document.getElementById('search-shortcut-kbd');
        if (shortcutKbd) {
            shortcutKbd.textContent = isMac ? '⌘K' : 'Ctrl+K';
        }
        displayCards([]); // 初期状態で「検索してください」を表示
        updatePaginationButtons(); // 初期化時にボタンを更新
        initTabSwitching(); // タブ切り替え処理の初期化
        setupSearchHandler(); // 検索の初期設定
        setupKeyboardShortcuts(); // キーボードショートカットの設定
        setupFocusManagement(); // フォーカス管理の設定
        updateVideoCount(0, 0);

        setTimeout(() => {
            console.log("Populating dropdowns...");
            populateChannelSelect();
            populateLevelSelect();
            populateSelect("type-input", "category_title");
            populateSelect("players-input", "players");
        }, 100);

        setupSearchHistory();

        // URL の ?q= で共有・検索（Search Console / JSON-LD SearchAction と一致）
        try {
            const q = new URLSearchParams(window.location.search).get('q');
            if (q && typeof q === 'string') {
                const trimmed = q.trim().substring(0, 200);
                if (trimmed) {
                    searchInput.value = trimmed;
                    search();
                }
            }
        } catch (_) { /* ignore */ }

        setTimeout(() => {
            console.log("Fallback: Re-populating dropdowns...");
            populateChannelSelect();
            populateLevelSelect();
            populateSelect("type-input", "category_title");
            populateSelect("players-input", "players");
        }, 5000);
    }

    updateSelectedMenusBadge();
    updateFavoritesBadge();
});

// ユニークな選択肢を取得・設定する関数
function populateSelect(selectId, columnName) {
    console.log(`Fetching data for ${columnName}...`);
    fetch(`/get_unique_values/${columnName}`)
        .then(response => {
            console.log(`Response status for ${columnName}:`, response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log(`Received data for ${columnName}:`, data);
            const select = document.getElementById(selectId);
            if (!select) {
                console.error(`Select element with id '${selectId}' not found`);
                return;
            }
            
            // 既存のoptionを完全にクリアしてから初期値をセット
            select.innerHTML = '';
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = selectId === "type-input"
                ? (typeof uiS === 'function' ? uiS('js_select_category') : 'カテゴリを選択')
                : (typeof uiS === 'function' ? uiS('js_select_players') : 'プレイヤー数を選択');
            select.appendChild(defaultOption);

            if (!Array.isArray(data) || data.length === 0) {
                console.warn(`No data received for ${columnName}, using default options`);
                // データが空の場合はデフォルト値を表示
                if (selectId === "type-input") {
                    const defaultOptions = ["対人", "その他"];
                    defaultOptions.forEach(value => {
                        const option = document.createElement("option");
                        option.value = value;
                        option.textContent = value;
                        select.appendChild(option);
                    });
                }
                return;
            }

            // 重複を除去したユニークな値のみを処理
            const uniqueData = [...new Set(data)];
            console.log(`Unique data for ${columnName}:`, uniqueData);

            const n_vs_n = [];
            const n_people = [];
            const others = [];

            uniqueData.forEach(value => {
                let match;
                if ((match = value.match(/^(\d+)対(\d+)$/))) {
                    // "n対n" の形式を解析
                    const num1 = parseInt(match[1], 10);
                    const num2 = parseInt(match[2], 10);
                    n_vs_n.push({ value, num1, num2 });
                } else if ((match = value.match(/^(\d+)人$/))) {
                    // "n人" の形式を解析
                    const num = parseInt(match[1], 10);
                    n_people.push({ value, num });
                } else {
                    // その他の値（例: "人数指定なし" など）
                    others.push(value);
                }
            });

            // 数値順にソート
            n_vs_n.sort((a, b) => a.num1 - b.num1 || a.num2 - b.num2);
            n_people.sort((a, b) => a.num - b.num);
            
            // カテゴリーの場合、「その他」を一番下に表示
            let sortedOthers;
            if (selectId === "type-input") {
                const nonSonota = others.filter(value => value !== "その他").sort();
                const sonota = others.filter(value => value === "その他");
                sortedOthers = [...nonSonota, ...sonota];
            } else {
                sortedOthers = others.sort(); // プレイヤー数の場合は通常の文字列ソート
            }

            // 並び替えたリストを `<select>` に追加
            [...n_vs_n.map(obj => obj.value), ...n_people.map(obj => obj.value), ...sortedOthers].forEach(value => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            });
            
            console.log(`Successfully populated ${selectId} with ${data.length} options`);
        })
        .catch(error => {
            console.error(`${columnName} データ取得エラー:`, error);
            // エラー時にデフォルトの選択肢を追加
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '';
                const defaultOption = document.createElement("option");
                defaultOption.value = "";
                defaultOption.textContent = selectId === "type-input"
                ? (typeof uiS === 'function' ? uiS('js_select_category') : 'カテゴリを選択')
                : (typeof uiS === 'function' ? uiS('js_select_players') : 'プレイヤー数を選択');
                select.appendChild(defaultOption);
                
                if (selectId === "type-input") {
                    const defaultOptions = ["対人", "その他"];
                    defaultOptions.forEach(value => {
                        const option = document.createElement("option");
                        option.value = value;
                        option.textContent = value;
                        select.appendChild(option);
                    });
                }
            }
        });
}




function populateLevelSelect() {
    console.log("Fetching levels...");
    fetch("/get_levels")
        .then(response => {
            console.log("Levels response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Received levels data:", data);
            const select = document.getElementById("level-input");
            if (!select) {
                console.error("Level select element not found");
                return;
            }
            
            // 既存のoptionを完全にクリアしてから初期値をセット
            select.innerHTML = '';
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = typeof uiS === 'function' ? uiS('js_select_level') : 'レベルを選択';
            select.appendChild(defaultOption);
            
            if (!Array.isArray(data) || data.length === 0) {
                console.warn("No levels data received, using default levels");
                // データが空の場合はデフォルト値を表示
                const defaultLevels = ["小学生以上", "中学生", "高校生", "ユース"];
                defaultLevels.forEach(level => {
                    const option = document.createElement("option");
                    option.value = level;
                    option.textContent = level;
                    select.appendChild(option);
                });
                return;
            }
            
            // 重複を除去したユニークなレベルのみを処理
            const uniqueLevels = [...new Set(data.map(level => level.level))];
            console.log("Unique levels:", uniqueLevels);
            
            uniqueLevels.forEach(level => {
                const option = document.createElement("option");
                option.value = level;
                option.textContent = level;
                select.appendChild(option);
            });
            console.log(`Successfully populated levels with ${uniqueLevels.length} unique options`);
        })
        .catch(error => {
            console.error("レベルデータ取得エラー:", error);
            // エラー時にデフォルトの選択肢を追加
            const select = document.getElementById("level-input");
            if (select) {
                select.innerHTML = '';
                const defaultOption = document.createElement("option");
                defaultOption.value = "";
                defaultOption.textContent = typeof uiS === 'function' ? uiS('js_select_level') : 'レベルを選択';
                select.appendChild(defaultOption);
                
                const defaultLevels = ["小学生以上", "中学生", "高校生", "ユース"];
                defaultLevels.forEach(level => {
                    const option = document.createElement("option");
                    option.value = level;
                    option.textContent = level;
                    select.appendChild(option);
                });
            }
        });
}

function populateChannelSelect() {
    console.log("Fetching channels...");
    fetch("/get_channels")
        .then(response => {
            console.log("Channels response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Received channels data:", data);
            const select = document.getElementById("channel-input");
            if (!select) {
                console.error("Channel select element not found");
                return;
            }
            
            // 既存のoptionを完全にクリアしてから初期値をセット
            select.innerHTML = '';
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = typeof uiS === 'function' ? uiS('js_select_channel') : 'チャンネルを選択';
            select.appendChild(defaultOption);
            
            if (!Array.isArray(data) || data.length === 0) {
                console.warn("No channels data received");
                return;
            }
            
            // 重複を除去したユニークなチャンネルのみを処理
            const uniqueChannels = data.filter((channel, index, self) => 
                index === self.findIndex(c => c.id === channel.id)
            );
            console.log("Unique channels:", uniqueChannels);
            
            uniqueChannels.forEach(channel => {
                const option = document.createElement("option");
                option.value = channel.id;
                option.textContent = channel.channel_name;
                select.appendChild(option);
            });
            
            const ul = document.querySelector(".right-half ul");
            if (ul) {
                // セキュリティ: innerHTML = "" は空文字列なので安全
                ul.innerHTML = ""; // リストをクリア
                data.forEach(channel => {
                    const li = document.createElement("li");
                    const a = document.createElement("a");
                    a.textContent = channel.channel_name || '';
                    // セキュリティ: URLの検証（http/httpsのみ許可）
                    const channelLink = channel.channel_link || '';
                    if (channelLink.startsWith('http://') || channelLink.startsWith('https://')) {
                        a.href = channelLink;
                    } else {
                        a.href = '#'; // 無効なURLの場合は#に設定
                    }
                    a.target = "_blank"; // 新しいタブで開く
                    a.rel = "noopener noreferrer"; // セキュリティ対策
                    li.appendChild(a);
                    ul.appendChild(li);
                });
            }
            
            console.log(`Successfully populated channels with ${data.length} options`);
        })
        .catch(error => {
            console.error("チャンネルデータ取得エラー:", error);
            // エラー時にデフォルトの選択肢を追加
            const select = document.getElementById("channel-input");
            if (select) {
                select.innerHTML = '';
                const defaultOption = document.createElement("option");
                defaultOption.value = "";
                defaultOption.textContent = typeof uiS === 'function' ? uiS('js_select_channel') : 'チャンネルを選択';
                select.appendChild(defaultOption);
                
                const defaultChannels = ["サッカーチャンネル1", "サッカーチャンネル2"];
                defaultChannels.forEach((channel, index) => {
                    const option = document.createElement("option");
                    option.value = `channel_${index + 1}`;
                    option.textContent = channel;
                    select.appendChild(option);
                });
            }
        });
}

// 数値フォーマット関数（例: 1000 → 1,000）
function formatNumber(num) {
    if (!num && num !== 0) return '0';
    const loc = (typeof window !== 'undefined' && window.__UI_LOCALE__ === 'en') ? 'en-US' : 'ja-JP';
    return Number(num).toLocaleString(loc);
}

// エラーメッセージを表示する関数
function showError(message, details = '') {
    const errorMessage = document.getElementById('error-message');
    const errorContent = errorMessage.querySelector('p') || document.createElement('p');
    errorContent.textContent = message;
    errorMessage.innerHTML = '';
    errorMessage.appendChild(errorContent);
    
    if (details) {
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'error-details';
        detailsDiv.textContent = details;
        errorMessage.appendChild(detailsDiv);
    }
    
    errorMessage.classList.remove('hidden');
}

// エラーメッセージを非表示にする関数
function hideError() {
    const errorMessage = document.getElementById('error-message');
    errorMessage.classList.add('hidden');
}

// ローディング状態を表示する関数
function showLoading() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const searchPrompt = document.getElementById('search-prompt');
    const cardContainer = document.querySelector('.card-container');
    if (!loadingIndicator || !searchPrompt || !cardContainer) return;

    loadingIndicator.classList.remove('hidden');
    searchPrompt.style.display = 'none';
    cardContainer.innerHTML = '';
    hideError();
}

// ローディング状態を非表示にする関数
function hideLoading() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

// カード表示用関数
function displayCards(data, limit = 10) {
    const cardContainer = document.querySelector('.card-container');
    const searchPrompt = document.getElementById('search-prompt');
    if (!cardContainer || !searchPrompt) return;

    cardContainer.innerHTML = ''; // 既存のカードをクリア
    hideLoading();
    hideError();

    if (!data || data.length === 0) {
        searchPrompt.style.display = 'block';
        searchPrompt.textContent = typeof uiS === 'function' ? uiS('js_no_results') : '検索結果が見つかりませんでした。検索条件を変更してお試しください。';
        return;
    }

    searchPrompt.style.display = 'none';
    data.slice(0, limit).forEach((activity) => {
        const card = buildVideoCard(activity, { listContext: 'search' });
        document.querySelector('.card-container').appendChild(card);
    });
}

/**
 * 検索結果カードまたはお気に入り一覧用のカードを組み立てる
 * @param {object} activity
 * @param {{ listContext?: 'search'|'favorites' }} options
 */
function buildVideoCard(activity, options = {}) {
    const listContext = options.listContext || 'search';
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.activityId = activity.id;

    const titleDiv = document.createElement('div');
    const titleStrong = document.createElement('strong');
    titleStrong.textContent = activity.title || '';
    titleDiv.appendChild(titleStrong);

    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    const iframe = document.createElement('iframe');
    const videoUrl = activity.video_url || '';
    if (videoUrl.startsWith('https://www.youtube.com/embed/') ||
        videoUrl.startsWith('https://youtube.com/embed/')) {
        iframe.src = videoUrl;
        iframe.setAttribute('loading', 'lazy');
    } else {
        iframe.src = '';
    }
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');
    videoContainer.appendChild(iframe);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'info';

    const uploadDateDiv = document.createElement('div');
    uploadDateDiv.textContent = (typeof uiS === 'function' ? uiS('js_uploaded_label') : 'アップロード日: ') + (activity.upload_date || '');

    const viewCountDiv = document.createElement('div');
    viewCountDiv.textContent = (typeof uiS === 'function' ? uiS('js_views_label') : '再生回数: ') + formatNumber(activity.view_count || 0);

    const likeCountDiv = document.createElement('div');
    likeCountDiv.textContent = (typeof uiS === 'function' ? uiS('js_likes_label') : 'いいね: ') + formatNumber(activity.like_count || 0);

    const durationDiv = document.createElement('div');
    durationDiv.textContent = (typeof uiS === 'function' ? uiS('js_duration_label') : '動画時間: ') + (activity.duration || '');

    const channelDiv = document.createElement('div');
    channelDiv.textContent = (typeof uiS === 'function' ? uiS('js_channel_label') : 'チャネル名: ') + (activity.channel_category || '');

    infoDiv.appendChild(uploadDateDiv);
    infoDiv.appendChild(viewCountDiv);
    infoDiv.appendChild(likeCountDiv);
    infoDiv.appendChild(durationDiv);
    infoDiv.appendChild(channelDiv);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'card-actions';

    const favoriteBtn = document.createElement('button');
    favoriteBtn.type = 'button';
    favoriteBtn.className = 'card-favorite-btn';

    function syncFavoriteBtn() {
        const fav = isFavorite(activity.id);
        favoriteBtn.classList.toggle('is-favorite', fav);
        favoriteBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
        if (listContext === 'favorites') {
            favoriteBtn.setAttribute('aria-label', typeof uiS === 'function' ? uiS('js_fav_remove') : 'お気に入りから外す');
            favoriteBtn.textContent = typeof uiS === 'function' ? uiS('js_fav_remove_short') : '★ お気に入りから外す';
        } else {
            favoriteBtn.setAttribute('aria-label', fav
                ? (typeof uiS === 'function' ? uiS('js_fav_remove') : 'お気に入りから外す')
                : (typeof uiS === 'function' ? uiS('js_fav_add_aria') : 'お気に入りに追加'));
            favoriteBtn.textContent = fav
                ? (typeof uiS === 'function' ? uiS('js_fav_in') : '★ お気に入り済み')
                : (typeof uiS === 'function' ? uiS('js_fav_add') : '☆ お気に入り');
        }
    }
    syncFavoriteBtn();

    favoriteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (listContext === 'favorites') {
            removeFavorite(activity.id);
            card.remove();
            updateFavoritesBadge();
            const list = document.getElementById('favorites-list');
            const empty = document.getElementById('favorites-empty');
            if (list && empty && list.children.length === 0) {
                empty.style.display = 'block';
            }
        } else {
            if (isFavorite(activity.id)) {
                removeFavorite(activity.id);
            } else {
                addFavorite(activity);
            }
            syncFavoriteBtn();
            updateFavoritesBadge();
        }
    });

    actionsRow.appendChild(favoriteBtn);

    card.appendChild(titleDiv);
    card.appendChild(videoContainer);
    card.appendChild(infoDiv);
    card.appendChild(actionsRow);

    return card;
}

// 表示中の動画数 / 総動画数を更新
function updateVideoCount(currentCount, totalCount) {
    const videoCountElement = document.getElementById('video-count');
    if (videoCountElement) {
        const tpl = typeof uiS === 'function' ? uiS('js_video_count') : '表示中: {cur} / {total} 件';
        videoCountElement.innerText = tpl.replace('{cur}', String(currentCount)).replace('{total}', String(totalCount));
    }
}

// データ取得処理
function fetchData(endpoint, queryParams, limit) {
    showLoading();
    
    return fetch(`${endpoint}?${queryParams}`)
        .then(response => {
            if (!response.ok) {
                // HTTPエラーの処理
                if (response.status === 500) {
                    throw new Error(typeof uiS === 'function' ? uiS('js_err_server') : 'サーバーエラーが発生しました。しばらくしてから再度お試しください。');
                } else if (response.status === 400) {
                    throw new Error(typeof uiS === 'function' ? uiS('js_err_bad_request') : 'リクエストが無効です。検索条件を確認してください。');
                } else {
                    const st = typeof uiS === 'function' ? uiS('js_err_status') : 'エラーが発生しました（ステータスコード: {code}）';
                    throw new Error(st.replace('{code}', String(response.status)));
                }
            }
            return response.json();
        })
        .then(data => {
            // エラーレスポンスのチェック
            if (data.error) {
                throw new Error(data.error);
            }
            
            displayCards(data.activities, limit);
            totalPages = Math.ceil(data.total / limit); // 総ページ数を計算
            updatePaginationButtons(); // ボタンの状態を更新
            togglePaginationVisibility(data.total);

            updateVideoCount(data.current_display_count, data.total);
        })
        .catch(error => {
            hideLoading();
            console.error('エラー:', error);
            
            // ユーザー向けエラーメッセージを表示
            let errorMessage = typeof uiS === 'function' ? uiS('js_err_search') : '検索中にエラーが発生しました。';
            let errorDetails = '';
            
            if (error.message) {
                errorMessage = error.message;
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = typeof uiS === 'function' ? uiS('js_err_network') : 'ネットワークエラーが発生しました。';
                errorDetails = typeof uiS === 'function' ? uiS('js_err_network_detail') : 'インターネット接続を確認してください。';
            } else {
                errorDetails = typeof uiS === 'function' ? uiS('js_err_retry') : 'しばらくしてから再度お試しください。';
            }
            
            showError(errorMessage, errorDetails);
            
            const searchPrompt = document.getElementById('search-prompt');
            if (searchPrompt) searchPrompt.style.display = 'block';
            throw error; // エラーを伝播させ、履歴保存をスキップ
        });
}

// ページング表示制御
function togglePaginationVisibility(totalResults) {
    const pagination = document.querySelector('.pagination');
    //pagination.style.display = totalResults < 11 ? 'none' : 'block';
    pagination.style.display = 'block';
}

// 検索処理
function search(resetPage = true) {
    const searchButton = document.getElementById('search-button');
    const searchInputEl = document.getElementById('search-input');
    if (!searchButton || !searchInputEl) return;

    if (resetPage) currentPage = 1;

    // 検索ボタンを無効化（重複リクエスト防止）
    const originalButtonText = typeof uiS === 'function' ? uiS('js_search') : '検索';
    searchButton.disabled = true;
    searchButton.textContent = typeof uiS === 'function' ? uiS('js_searching') : '検索中...';

    // セキュリティ: 入力値の取得と基本的な検証
    const searchInput = searchInputEl;
    const typeInput = document.getElementById('type-input');
    const playersInput = document.getElementById('players-input');
    const levelInput = document.getElementById('level-input');
    const channelInput = document.getElementById('channel-input');
    const sortInput = document.getElementById('sort-input');

    // セキュリティ: 入力値の長さ制限（クライアント側検証）
    const query = (searchInput.value || '').trim().substring(0, 200); // 最大200文字
    const type = (typeInput.value || '').trim().substring(0, 100);
    const players = (playersInput.value || '').trim().substring(0, 100);
    const level = (levelInput.value || '').trim().substring(0, 100);
    const channel = (channelInput.value || '').trim().substring(0, 100);
    
    // セキュリティ: sortパラメータのホワイトリスト検証（クライアント側）
    const allowedSorts = ['upload_date', 'view_count', 'like_count'];
    const sort = allowedSorts.includes(sortInput.value) ? sortInput.value : 'upload_date';

    const queryParams = new URLSearchParams({
        q: query,
        type: type,
        players: players,
        level: level,
        channel: channel,
        sort: sort,
        limit: getLimit(),
        offset: (currentPage - 1) * getLimit(),
    }).toString();

    fetchData('/search', queryParams, getLimit())
        .then(() => addToSearchHistory(query))
        .finally(() => {
            // 検索完了後にボタンを再有効化
            searchButton.disabled = false;
            searchButton.textContent = originalButtonText;
        });
}

// 入力されたリミットを取得
function getLimit() {
    const limitInput = parseInt(document.getElementById('limit-input').value, 10);
    return isNaN(limitInput) || limitInput <= 0 ? 10 : Math.min(limitInput, 10);
}

let currentPage = 1;
let totalPages = 1;

// ページ変更処理
function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    updatePaginationButtons();
    search(false);
}

// ボタンの有効/無効を更新
function updatePaginationButtons() {
    const prevButton = document.getElementById("prev-page");
    const nextButton = document.getElementById("next-page");
    const currentPageLabel = document.getElementById("current-page");

    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage >= totalPages;
    currentPageLabel.innerText = currentPage;

    if (totalPages === 1) {
        prevButton.disabled = true;
        nextButton.disabled = true;
    }
}

// タブ切り替え処理
function initTabSwitching() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabPanels = document.querySelectorAll(".tab-panel");
    const searchContainer = document.querySelector(".search-container");
    const mainContent = document.querySelector(".main-content");
    const paragraphContainer = document.querySelector(".paragraph-container");
    const pagination = document.querySelector(".pagination");

    const typeInput = document.getElementById("type-input");
    const playersInput = document.getElementById("players-input");
    if (!typeInput || !playersInput) return;

    typeInput.addEventListener("change", () => {
        playersInput.disabled = typeInput.value !== "対人";
    });

    tabButtons.forEach(button => {
        button.addEventListener("click", () => {
            tabButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            tabPanels.forEach(panel => panel.classList.remove("active"));

            const targetTab = button.getAttribute("data-tab");
            document.getElementById(targetTab).classList.add("active");

            handleTabVisibility(targetTab, searchContainer, mainContent, paragraphContainer, pagination);
        });
    });
}

// タブに基づいて表示内容を切り替え
function handleTabVisibility(targetTab, searchContainer, mainContent, paragraphContainer, pagination) {
    if (targetTab === "tab2") {
        searchContainer.classList.add("hidden");
        mainContent.classList.add("full-width");
        paragraphContainer.style.display = "block";
        pagination.style.display = "none";
    } else {
        searchContainer.classList.remove("hidden");
        mainContent.classList.remove("full-width");
        paragraphContainer.style.display = "none";
        pagination.style.display = "block";
    }
}

// フォームの初期化処理
function setupSearchHandler() {
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const formData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                category: document.getElementById('category').value,
                message: document.getElementById('message').value
            };

            submitFeedback(formData);
        });
    }
}

// フィードバック送信処理
async function submitFeedback(formData) {
    // セキュリティ: CSRFトークンを取得
    const token = await getCsrfToken();
    if (!token) {
        alert(typeof uiS === 'function' ? uiS('js_csrf_alert') : 'セキュリティトークンの取得に失敗しました。ページを再読み込みしてください。');
        return;
    }
    
    // 送信ボタンを無効化
    const submitButton = document.querySelector('#feedbackForm button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = typeof uiS === 'function' ? uiS('js_feedback_sending') : '送信中...';
    
    fetch('/submit-feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': token  // セキュリティ: CSRFトークンをヘッダーに含める
        },
        body: JSON.stringify(formData)
    })
    .then(response => {
        if (response.ok) {
            const responseMessage = document.getElementById('responseMessage');
            responseMessage.classList.remove('hidden');
            document.getElementById('feedbackForm').reset();
            
            // 5秒後に自動で非表示
            setTimeout(() => {
                responseMessage.classList.add('hidden');
            }, 5000);
            
            // トークンを再取得（次の送信に備えて）
            csrfToken = null;
            getCsrfToken();
        } else {
            if (response.status === 400) {
                // CSRFエラーの可能性がある場合はトークンを再取得
                csrfToken = null;
                alert(typeof uiS === 'function' ? uiS('js_feedback_fail') : '送信に失敗しました。もう一度お試しください。');
            } else {
                alert(typeof uiS === 'function' ? uiS('js_feedback_fail') : '送信に失敗しました。もう一度お試しください。');
            }
        }
    })
    .catch(error => {
        console.error('エラー:', error);
        alert(typeof uiS === 'function' ? uiS('js_feedback_fail') : '送信に失敗しました。もう一度お試しください。');
    })
    .finally(() => {
        // 送信完了後にボタンを再有効化
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    });
}

// 練習メモ帳: 選んだメニュー（localStorage）
const SELECTED_MENUS_KEY = 'soccer_selected_menus';

/** ヘッダー数字バッジは「追加直後の目印」だけ。該当ページ表示・リロードで消す（件数の常時表示ではない） */
const NAV_MEMO_BADGE_PENDING_KEY = 'soccer_nav_memo_badge_pending';
const NAV_FAV_BADGE_PENDING_KEY = 'soccer_nav_fav_badge_pending';

function isNavigationReload() {
    try {
        const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if (nav && nav.type === 'reload') return true;
    } catch (e) { /* ignore */ }
    try {
        if (typeof performance !== 'undefined' && performance.navigation && performance.navigation.type === 1) {
            return true;
        }
    } catch (e2) { /* ignore */ }
    return false;
}

function applyNavBadgeSessionContext() {
    try {
        if (isNavigationReload()) {
            sessionStorage.removeItem(NAV_FAV_BADGE_PENDING_KEY);
            sessionStorage.removeItem(NAV_MEMO_BADGE_PENDING_KEY);
            return;
        }
        const p = window.location.pathname || '';
        if (p === '/favorites' || /\/favorites\/?$/.test(p)) {
            sessionStorage.removeItem(NAV_FAV_BADGE_PENDING_KEY);
        }
        if (p === '/practice-notes' || /\/practice-notes\/?$/.test(p)) {
            sessionStorage.removeItem(NAV_MEMO_BADGE_PENDING_KEY);
        }
    } catch (e) { /* ignore */ }
}

function getSelectedMenus() {
    try {
        const stored = localStorage.getItem(SELECTED_MENUS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveSelectedMenus(items) {
    try {
        localStorage.setItem(SELECTED_MENUS_KEY, JSON.stringify(items));
        return true;
    } catch (e) {
        console.warn((typeof uiS === 'function' ? uiS('js_sel_history_warn') : '選んだメニューの保存に失敗:'), e);
        return false;
    }
}

function addToSelectedMenus(activity) {
    const items = getSelectedMenus();
    const exists = items.some(it => it.id === activity.id);
    if (exists) return false;
    try {
        sessionStorage.setItem(NAV_MEMO_BADGE_PENDING_KEY, '1');
    } catch (e) { /* ignore */ }
    items.push({ ...activity, memo: '' });
    saveSelectedMenus(items);
    updateSelectedMenusBadge();
    if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
    return true;
}

function removeFromSelectedMenus(activityId) {
    const items = getSelectedMenus().filter(it => it.id !== activityId);
    saveSelectedMenus(items);
    updateSelectedMenusBadge();
    if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
}

function updateSelectedMenusBadge() {
    applyNavBadgeSessionContext();
    const count = getSelectedMenus().length;
    const badge = document.getElementById('practice-notes-badge');
    let show = false;
    try {
        show = count > 0 && sessionStorage.getItem(NAV_MEMO_BADGE_PENDING_KEY) === '1';
    } catch (e) {
        show = false;
    }
    if (badge) {
        badge.textContent = show ? String(count) : '';
        badge.style.display = show ? 'inline-flex' : 'none';
    }
}

// お気に入り動画（localStorage）
const FAVORITES_KEY = 'soccer_favorite_videos';

function getFavorites() {
    try {
        const stored = localStorage.getItem(FAVORITES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveFavorites(items) {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
        return true;
    } catch (e) {
        console.warn((typeof uiS === 'function' ? uiS('js_sel_fav_warn') : 'お気に入りの保存に失敗:'), e);
        return false;
    }
}

function isFavorite(activityId) {
    return getFavorites().some(it => it.id === activityId);
}

function addFavorite(activity) {
    const items = getFavorites();
    if (items.some(it => it.id === activity.id)) return false;
    try {
        sessionStorage.setItem(NAV_FAV_BADGE_PENDING_KEY, '1');
    } catch (e) { /* ignore */ }
    items.push({ ...activity });
    saveFavorites(items);
    updateFavoritesBadge();
    if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
    return true;
}

function removeFavorite(activityId) {
    const items = getFavorites().filter(it => it.id !== activityId);
    saveFavorites(items);
    updateFavoritesBadge();
    if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
}

function updateFavoritesBadge() {
    applyNavBadgeSessionContext();
    const count = getFavorites().length;
    const badge = document.getElementById('favorites-badge');
    let show = false;
    try {
        show = count > 0 && sessionStorage.getItem(NAV_FAV_BADGE_PENDING_KEY) === '1';
    } catch (e) {
        show = false;
    }
    if (badge) {
        badge.textContent = show ? String(count) : '';
        badge.style.display = show ? 'inline-flex' : 'none';
    }
}

/** ログアウト同期などで localStorage が変わったあと、検索結果カードの★表示を合わせ直す */
function resyncSearchResultsFavoriteButtons() {
    const container = document.querySelector('.card-container');
    if (!container) return;
    container.querySelectorAll('.card[data-activity-id] .card-favorite-btn').forEach((btn) => {
        const card = btn.closest('.card');
        if (!card || !card.dataset.activityId) return;
        const fav = isFavorite(card.dataset.activityId);
        btn.classList.toggle('is-favorite', fav);
        btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
        btn.setAttribute('aria-label', fav
            ? (typeof uiS === 'function' ? uiS('js_fav_remove') : 'お気に入りから外す')
            : (typeof uiS === 'function' ? uiS('js_fav_add_aria') : 'お気に入りに追加'));
        btn.textContent = fav
            ? (typeof uiS === 'function' ? uiS('js_fav_in') : '★ お気に入り済み')
            : (typeof uiS === 'function' ? uiS('js_fav_add') : '☆ お気に入り');
    });
}

window.addEventListener('soccerUserDataSynced', () => {
    updateFavoritesBadge();
    updateSelectedMenusBadge();
    resyncSearchResultsFavoriteButtons();
});

// 検索履歴（localStorage、最大10件）
const SEARCH_HISTORY_KEY = 'soccer_search_history';
const SEARCH_HISTORY_MAX = 10;

function getSearchHistory() {
    try {
        const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveSearchHistory(query) {
    if (!query || query.length < 2) return;
    let history = getSearchHistory().filter(q => q !== query);
    history.unshift(query);
    history = history.slice(0, SEARCH_HISTORY_MAX);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
        if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
    } catch (e) {
        console.warn('検索履歴の保存に失敗:', e);
    }
}

function removeFromSearchHistory(query) {
    let history = getSearchHistory().filter(q => q !== query);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
        if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
    } catch (e) {
        console.warn('検索履歴の削除に失敗:', e);
    }
}

function setupSearchHistory() {
    const searchInput = document.getElementById('search-input');
    const searchPrimary = document.querySelector('.search-primary');
    const searchField = document.querySelector('.search-primary-field');
    if (!searchInput || !searchPrimary) return;
    const historyParent = searchField || searchPrimary;

    let historyEl = document.getElementById('search-history-dropdown');
    if (!historyEl) {
        historyEl = document.createElement('div');
        historyEl.id = 'search-history-dropdown';
        historyEl.className = 'search-history-dropdown hidden';
        historyEl.setAttribute('aria-label', typeof uiS === 'function' ? uiS('js_search_history_aria') : '検索履歴');
        historyParent.appendChild(historyEl);
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showHistory() {
        const history = getSearchHistory();
        if (history.length === 0) {
            historyEl.classList.add('hidden');
            return;
        }
        const rm = (typeof uiS === 'function' ? uiS('js_history_remove_aria') : 'この履歴を削除').replace(/"/g, '&quot;');
        historyEl.innerHTML = history.map(q =>
            `<div class="search-history-row" data-query="${q.replace(/"/g, '&quot;')}">
                <button type="button" class="search-history-item">${escapeHtml(q)}</button>
                <button type="button" class="search-history-delete" aria-label="${rm}">×</button>
            </div>`
        ).join('');
        historyEl.classList.remove('hidden');
    }
    
    function hideHistory() {
        setTimeout(() => historyEl.classList.add('hidden'), 150);
    }
    
    let ignoreNextBlur = false;
    searchInput.addEventListener('focus', showHistory);
    searchInput.addEventListener('blur', () => {
        if (ignoreNextBlur) { ignoreNextBlur = false; return; }
        hideHistory();
    });
    searchInput.addEventListener('input', () => {
        if ((searchInput.value || '').trim().length === 0) showHistory();
        else historyEl.classList.add('hidden');
    });
    
    historyEl.addEventListener('mousedown', (e) => {
        const deleteBtn = e.target.closest('.search-history-delete');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            ignoreNextBlur = true;
            const row = deleteBtn.closest('.search-history-row');
            const query = row ? row.dataset.query : '';
            if (query) {
                removeFromSearchHistory(query);
                showHistory();
                searchInput.focus();
            }
            return;
        }
        const itemBtn = e.target.closest('.search-history-item');
        const row = itemBtn ? itemBtn.closest('.search-history-row') : null;
        if (row) {
            e.preventDefault();
            const query = row.dataset.query || '';
            searchInput.value = query;
            searchInput.focus();
            search(true);
            hideHistory();
        }
    });
}

// 検索成功時に履歴へ保存（search関数内で呼ぶ）
function addToSearchHistory(query) {
    if (query && query.trim().length >= 2) {
        saveSearchHistory(query.trim());
    }
}


