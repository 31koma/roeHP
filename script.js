document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-menu a');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            menuToggle.setAttribute('aria-expanded', mobileMenu.classList.contains('active') ? 'true' : 'false');
            document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
        });

        // Close menu when a link is clicked
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                mobileMenu.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            });
        });
    }

    renderNewsLists();
});

const NEWS_JSON_PATHS = [
    '/api/news',
    '/public/news.json',
    '/news.json',
    'public/news.json',
    '../public/news.json'
];

async function fetchNewsItems() {
    for (const path of NEWS_JSON_PATHS) {
        try {
            const response = await fetch(path, { cache: 'no-store' });

            if (!response.ok) {
                continue;
            }

            const items = await response.json();

            if (Array.isArray(items)) {
                return normalizeNewsItems(items);
            }
        } catch (error) {
            // Try the next location. This keeps local static hosting and future public-root hosting both usable.
        }
    }

    return [];
}

function normalizeNewsItems(items) {
    return items
        .filter(item => item && item.id && item.date && item.title)
        .map(item => ({
            id: String(item.id),
            date: String(item.date),
            title: String(item.title),
            menuName: item.menuName || item.menu_name ? String(item.menuName || item.menu_name) : '',
            price: item.price ? String(item.price) : '',
            salesTime: item.salesTime || item.sales_time ? String(item.salesTime || item.sales_time) : '',
            bodyJa: item.bodyJa || item.body_ja ? String(item.bodyJa || item.body_ja) : '',
            bodyEn: item.bodyEn || item.body_en ? String(item.bodyEn || item.body_en) : '',
            imageAlt: item.imageAlt || item.image_alt ? String(item.imageAlt || item.image_alt) : String(item.title),
            imageUrl: item.imageUrl || item.image_url ? String(item.imageUrl || item.image_url) : '',
            source: item.source ? String(item.source) : ''
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

async function renderNewsLists() {
    const lists = document.querySelectorAll('[data-news-list]');

    if (!lists.length) {
        return;
    }

    const newsItems = await fetchNewsItems();

    lists.forEach(list => {
        const limit = Number.parseInt(list.dataset.newsLimit, 10);
        const visibleItems = Number.isFinite(limit) ? newsItems.slice(0, limit) : newsItems;

        list.innerHTML = '';

        if (!visibleItems.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'news-empty';
            emptyMessage.textContent = list.dataset.newsEmpty || 'お知らせはありません。';
            list.append(emptyMessage);
            return;
        }

        visibleItems.forEach(item => {
            list.append(createNewsCard(item));
        });
    });
}

function createNewsCard(item) {
    const article = document.createElement('article');
    article.className = item.imageUrl ? 'news-card has-image' : 'news-card';
    article.id = `news-${item.id}`;

    if (item.imageUrl) {
        const figure = document.createElement('figure');
        figure.className = 'news-card-image';

        const image = document.createElement('img');
        image.src = item.imageUrl;
        image.alt = item.imageAlt;
        image.loading = 'lazy';
        image.decoding = 'async';

        figure.append(image);
        article.append(figure);
    }

    const content = document.createElement('div');
    content.className = 'news-card-content';

    const meta = document.createElement('div');
    meta.className = 'news-card-meta';

    const time = document.createElement('time');
    time.dateTime = item.date;
    time.textContent = formatNewsDate(item.date);
    meta.append(time);

    if (item.source) {
        const source = document.createElement('span');
        source.textContent = item.source;
        meta.append(source);
    }

    const title = document.createElement('h2');
    title.className = 'news-card-title';
    title.textContent = item.title;

    content.append(meta, title);

    const details = createNewsDetails(item);

    if (details) {
        content.append(details);
    }

    if (item.bodyJa) {
        const bodyJa = document.createElement('p');
        bodyJa.className = 'news-card-body';
        bodyJa.textContent = item.bodyJa;
        content.append(bodyJa);
    }

    if (item.bodyEn) {
        const bodyEn = document.createElement('p');
        bodyEn.className = 'news-card-body en-text';
        bodyEn.textContent = item.bodyEn;
        content.append(bodyEn);
    }

    article.append(content);
    return article;
}

function createNewsDetails(item) {
    const detailItems = [
        ['メニュー', item.menuName],
        ['価格', item.price],
        ['時間', item.salesTime]
    ].filter(([, value]) => value);

    if (!detailItems.length) {
        return null;
    }

    const list = document.createElement('dl');
    list.className = 'news-card-details';

    detailItems.forEach(([label, value]) => {
        const term = document.createElement('dt');
        term.textContent = label;

        const description = document.createElement('dd');
        description.textContent = value;

        list.append(term, description);
    });

    return list;
}

function formatNewsDate(dateText) {
    const date = new Date(`${dateText}T00:00:00+09:00`);

    if (Number.isNaN(date.getTime())) {
        return dateText;
    }

    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

// DM例文コピーボタン
document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', () => {
        const target = document.querySelector(button.dataset.copyTarget);
        if (!target || !navigator.clipboard) {
            return;
        }
        navigator.clipboard.writeText(target.textContent.trim()).then(() => {
            const original = button.textContent;
            button.textContent = 'コピーしました';
            setTimeout(() => {
                button.textContent = original;
            }, 2000);
        });
    });
});
