let currentRole = null;
let currentUserId = null;
let currentMealCategory = 'breakfast';

let menuCalendarView = 'week';
let menuCalendarAnchor = new Date();

let myAllergens = [];

let subscriptionPricing = null;

let activeSubscriptions = [];
let _lastKnownBalance = null;

let _manualPaymentAmount = '';

let _issueStudentSuggestionsCache = [];

let _dishProductsCache = null;
let _dishCreateInitialized = false;
let _dishIngredientRowSeq = 0;



const ALLERGEN_OPTIONS = [
    'молоко',
    'яйца',
    'глютен',
    'орехи',
    'арахис',
    'рыба',
    'морепродукты',
    'соя',
    'кунжут'
];

async function apiFetch(url, options = {}) {
    const response = await fetch(url, options);
    if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Unauthorized');
    }
    return response;
}

let _pricingPromise = null;

async function loadPricing(force = false) {
    if (subscriptionPricing && !force) return subscriptionPricing;
    if (_pricingPromise && !force) return _pricingPromise;

    _pricingPromise = (async () => {
        try {
            const resp = await apiFetch('/api/pricing');
            const data = await resp.json();
            if (resp.ok) {
                subscriptionPricing = (data && data.subscription) ? data.subscription : data;
                return subscriptionPricing;
            }
        } catch (e) {
            console.error(e);
        }
        return null;
    })();

    try {
        return await _pricingPromise;
    } finally {
        _pricingPromise = null;
    }
}

function round2(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

function getSubscriptionDayPriceClient(mealType) {
    if (!subscriptionPricing) return null;
    const v = Number(subscriptionPricing[mealType]);
    return Number.isFinite(v) ? v : null;
}

function updateSubscriptionPriceUI() {
    const paymentTypeSelect = document.getElementById('paymentTypeSelect');
    const amountInput = document.getElementById('paymentAmountInput');
    const daysInput = document.getElementById('subscriptionDaysInput');
    const mealTypeSelect = document.getElementById('paymentMealTypeSelect');
    const hintEl = document.getElementById('subscriptionPriceHint');

    if (!paymentTypeSelect || !amountInput) return;

    if (paymentTypeSelect.value !== 'subscription') {
        amountInput.readOnly = false;
        if (hintEl) hintEl.textContent = '';
        return;
    }

    amountInput.readOnly = true;

    const days = daysInput ? parseInt(daysInput.value || '20', 10) : 20;
    const mealType = mealTypeSelect ? mealTypeSelect.value : 'breakfast';

    if (!subscriptionPricing) {
        if (hintEl) hintEl.textContent = 'Загрузка стоимости...';
        loadPricing().then(() => updateSubscriptionPriceUI());
        return;
    }

    const dayPrice = getSubscriptionDayPriceClient(mealType);
    if (!Number.isFinite(dayPrice) || dayPrice <= 0) {
        amountInput.value = '';
        if (hintEl) hintEl.textContent = 'Администратор не задал стоимость абонемента.';
        return;
    }

    const safeDays = Number.isFinite(days) && days > 0 ? days : 0;
    const total = round2(dayPrice * safeDays);
    amountInput.value = total ? String(total) : '';
    if (hintEl) hintEl.textContent = `Абонемент: ${dayPrice} ₽/день × ${safeDays} = ${total} ₽`;
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('loginForm') || document.getElementById('registerForm')) {
        initAuthPage();
    }

    if (document.getElementById('mainApp')) {
        initMainPage();
    }
});


function switchAuthTab(tab, el) {
    document.querySelectorAll('.auth-card .tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (!loginForm || !registerForm) return;

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}



function initPasswordToggles() {
    document.querySelectorAll('.password-toggle[data-toggle-password]').forEach(btn => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';

        btn.addEventListener('click', () => {
            const inputId = btn.getAttribute('data-toggle-password');
            const input = inputId ? document.getElementById(inputId) : null;
            if (!input) return;

            const willShow = input.type === 'password';
            input.type = willShow ? 'text' : 'password';

            const label = willShow ? 'Скрыть пароль' : 'Показать пароль';
            const imgSrc = willShow ? '/static/img/eye-off.svg' : '/static/img/eye-on.svg';
            const alt = label;
            btn.innerHTML = `<img src="${imgSrc}" alt="${alt}" class="password-toggle-icon" width="20" height="20">`;
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
        });
    });
}

function initAuthPage() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    initPasswordToggles();

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(Object.fromEntries(formData))
                });

                const data = await response.json();

                if (response.ok) {
                    showNotification('Вход выполнен успешно', 'success');
                    window.location.href = '/main';
                } else {
                    showNotification(data.error || 'Ошибка входа', 'error');
                }
            } catch (error) {
                showNotification('Ошибка подключения', 'error');
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(Object.fromEntries(formData))
                });

                const data = await response.json();

                if (response.ok) {
                    showNotification('Регистрация успешна! Войдите в систему', 'success');
                    switchAuthTab('login', document.querySelector('.auth-card .tab[data-tab="login"]'));
                    e.target.reset();
        loadIssueMenuOptions();
                } else {
                    showNotification(data.error || 'Ошибка регистрации', 'error');
                }
            } catch (error) {
                showNotification('Ошибка подключения', 'error');
            }
        });
    }
}

async function logout() {
    try {
        await fetch('/api/logout', {method: 'POST'});
    } finally {
        window.location.href = '/login';
    }
}

async function initMainPage() {
    try {
        const meResp = await apiFetch('/api/me');
        const me = await meResp.json();

        currentRole = me.role;
        currentUserId = me.user_id || null;
        try {
            document.body.dataset.role = me.role || '';
        } catch (e) {
        }
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = me.full_name || me.username || '';

        if (me.role === 'student') {
            document.getElementById('studentDashboard')?.classList.remove('hidden');
            await refreshMyAllergens();
            loadMenu('breakfast');
            loadMenuCalendar();
            loadBalanceAndSubscriptions();
            loadClaimMenuOptions();
            loadPreferences();
            await loadPricing();
        } else if (me.role === 'cook') {
            document.getElementById('cookDashboard')?.classList.remove('hidden');
            loadMealStats();
        } else if (me.role === 'admin') {
            document.getElementById('adminDashboard')?.classList.remove('hidden');
            loadAdminStats();
        }
        initMainEventHandlers();
        if (typeof initCardFormHandlers === 'function') {
            initCardFormHandlers();
        }
        updateSubscriptionPriceUI();
        refreshNotificationBadge();
    } catch (err) {
        console.error(err);
    }
}

function initMainEventHandlers() {
    const paymentTypeSelect = document.getElementById('paymentTypeSelect');
    const subscriptionDaysGroup = document.getElementById('subscriptionDaysGroup');
    const paymentAmountInput = document.getElementById('paymentAmountInput');
    const subscriptionDaysInput = document.getElementById('subscriptionDaysInput');
    const paymentMealTypeSelect = document.getElementById('paymentMealTypeSelect');

    if (paymentTypeSelect && subscriptionDaysGroup) {
        const sync = () => {
            const isSub = paymentTypeSelect.value === 'subscription';

            if (isSub) {
                subscriptionDaysGroup.classList.remove('hidden');
                if (paymentAmountInput && !paymentAmountInput.readOnly) {
                    _manualPaymentAmount = paymentAmountInput.value || '';
                }
            } else {
                subscriptionDaysGroup.classList.add('hidden');
                if (paymentAmountInput) {
                    paymentAmountInput.readOnly = false;
                    paymentAmountInput.value = _manualPaymentAmount || '';
                }
            }

            updateSubscriptionPriceUI();
        };
        paymentTypeSelect.addEventListener('change', sync);
        sync();
    }
    if (subscriptionDaysInput) {
        subscriptionDaysInput.addEventListener('input', updateSubscriptionPriceUI);
    }
    if (paymentMealTypeSelect) {
        paymentMealTypeSelect.addEventListener('change', updateSubscriptionPriceUI);
    }

    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) {
        paymentForm.addEventListener('submit', handlePaymentSubmit);
    }

    const allergyForm = document.getElementById('allergyForm');
    if (allergyForm) {
        allergyForm.addEventListener('submit', handleAllergySubmit);
    }

    const preferencesForm = document.getElementById('preferencesForm');
    if (preferencesForm) {
        preferencesForm.addEventListener('submit', handlePreferencesSubmit);
    }

    const reviewForm = document.getElementById('reviewForm');
    if (reviewForm) {
        reviewForm.addEventListener('submit', handleReviewSubmit);
    }

    const purchaseRequestForm = document.getElementById('purchaseRequestForm');
    if (purchaseRequestForm) {
        purchaseRequestForm.addEventListener('submit', handlePurchaseRequestSubmit);
    }

    const issueMealForm = document.getElementById('issueMealForm');
    if (issueMealForm) {
        issueMealForm.addEventListener('submit', handleIssueMealSubmit);
    }


    const issueMealTypeSelect = document.getElementById('issueMealTypeSelect');
    if (issueMealTypeSelect && issueMealTypeSelect.dataset.bound !== '1') {
        issueMealTypeSelect.dataset.bound = '1';
        issueMealTypeSelect.addEventListener('change', () => {
            loadIssueMenuOptions();
        });
    }

    const adminNotificationForm = document.getElementById('adminNotificationForm');
    if (adminNotificationForm) {
        adminNotificationForm.addEventListener('submit', handleAdminNotificationSubmit);
    }

    const adminPricingForm = document.getElementById('adminPricingForm');
    if (adminPricingForm) {
        adminPricingForm.addEventListener('submit', handleAdminPricingSubmit);
    }

    initIssueStudentAutocomplete();

    const reportPeriodSelect = document.getElementById('reportPeriodSelect');
    const reportCustomDaysInput = document.getElementById('reportCustomDaysInput');

    if (reportPeriodSelect) {
        reportPeriodSelect.addEventListener('change', onReportPeriodChange);
        syncReportPeriodUI();
    }

    if (reportCustomDaysInput) {
        reportCustomDaysInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loadReport();
            }
        });
        reportCustomDaysInput.addEventListener('change', () => {
            const sel = document.getElementById('reportPeriodSelect');
            if (sel && sel.value === 'custom') loadReport();
        });
    }


    if (typeof initCardFormHandlers === 'function') {
        initCardFormHandlers();
    }
}

function showStudentSection(section, el) {
    document.querySelectorAll('#studentDashboard .nav-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');

    document.querySelectorAll('#studentDashboard > div[id$="Section"]').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(`student${capitalize(section)}Section`);
    if (target) target.classList.remove('hidden');

    if (section === 'menu') {
        loadMenu(currentMealCategory);
        loadMenuCalendar();
    }
    if (section === 'payment') loadBalanceAndSubscriptions();
    if (section === 'claim') loadClaimMenuOptions();
    if (section === 'allergies') {
        loadAllergies();
        loadPreferences();
    }
    if (section === 'reviews') {
        loadMenuForReview();
        loadReviews();
    }
    if (section === 'notifications') {
        loadNotifications();
    }
}

function _safeLocalStorageGet(key) {
    try {
        return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (e) {
        return null;
    }
}

function _safeLocalStorageSet(key, value) {
    try {
        if (window.localStorage) window.localStorage.setItem(key, value);
    } catch (e) {
    }
}

function fillClaimSelect(selectEl, items, storageKey, placeholder) {
    if (!selectEl) return;

    if (!Array.isArray(items) || items.length === 0) {
        selectEl.innerHTML = `<option value="" disabled selected>${escapeHtml(placeholder)} пока недоступен</option>`;
        selectEl.disabled = true;
        return;
    }

    selectEl.disabled = false;
    selectEl.innerHTML = items
        .map(i => `<option value="${i.id}">${escapeHtml(i.name)} — ${i.price} ₽</option>`)
        .join('');
    const stored = _safeLocalStorageGet(storageKey);
    const canUseStored = stored && items.some(i => String(i.id) === String(stored));
    selectEl.value = canUseStored ? String(stored) : String(items[0].id);
    if (selectEl.dataset.bound !== '1') {
        selectEl.dataset.bound = '1';
        selectEl.addEventListener('change', () => {
            _safeLocalStorageSet(storageKey, String(selectEl.value || ''));
        });
    }
}

async function loadClaimMenuOptions() {
    const breakfastSelect = document.getElementById('claimBreakfastSelect');
    const lunchSelect = document.getElementById('claimLunchSelect');

    if (!breakfastSelect && !lunchSelect) return;

    try {
        const todayIso = _toISODateLocal(new Date());

        async function fetchMenuForToday(category) {
            const r1 = await apiFetch(`/api/menu?category=${encodeURIComponent(category)}&date=${encodeURIComponent(todayIso)}`);
            const j1 = await r1.json();
            if (Array.isArray(j1) && j1.length) return j1;

            const r2 = await apiFetch(`/api/menu?category=${encodeURIComponent(category)}`);
            return await r2.json();
        }

        const [breakfastItems, lunchItems] = await Promise.all([
            fetchMenuForToday('breakfast'),
            fetchMenuForToday('lunch')
        ]);


        fillClaimSelect(breakfastSelect, breakfastItems, 'canteen_selected_breakfast', 'Завтрак');
        fillClaimSelect(lunchSelect, lunchItems, 'canteen_selected_lunch', 'Обед');
    } catch (e) {
        console.error(e);
    }
}

async function claimSelectedMeal(type) {
    const selectId = type === 'breakfast' ? 'claimBreakfastSelect' : 'claimLunchSelect';
    const select = document.getElementById(selectId);
    const menuItemId = select ? parseInt(select.value, 10) : NaN;

    if (!Number.isFinite(menuItemId)) {
        showNotification('Выберите блюдо', 'error');
        return;
    }

    try {
        await claimMeal(type, menuItemId);
    } catch (e) {
        console.error(e);
    }
}

async function loadIssueMenuOptions() {
    const mealTypeSelect = document.getElementById('issueMealTypeSelect');
    const menuSelect = document.getElementById('issueMenuItemSelect');

    if (!mealTypeSelect || !menuSelect) return;

    const category = mealTypeSelect.value || 'breakfast';
    const todayIso = _toISODateLocal(new Date());

    try {
        const resp = await apiFetch(`/api/menu?category=${encodeURIComponent(category)}&date=${encodeURIComponent(todayIso)}`);
        let items = await resp.json();

        if (!Array.isArray(items)) items = [];

        menuSelect.innerHTML = '';

        if (!items.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Нет блюд на сегодня';
            menuSelect.appendChild(opt);
            menuSelect.disabled = true;
            return;
        }

        menuSelect.disabled = false;

        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.name} — ${item.price} ₽`;
            menuSelect.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
        menuSelect.innerHTML = '<option value="">Ошибка загрузки меню</option>';
        menuSelect.disabled = true;
    }
}

async function loadMenu(category, el) {
    currentMealCategory = category;

    document.querySelectorAll('#studentMenuSection .tab[data-category]').forEach(t => t.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else {
        document.querySelector(`#studentMenuSection .tab[data-category="${category}"]`)?.classList.add('active');
    }
    if (currentRole === 'student') {
        await refreshMyAllergens();
    }

    const todayIso = _toISODateLocal(new Date());

    let response = await apiFetch(`/api/menu?category=${encodeURIComponent(category)}&date=${encodeURIComponent(todayIso)}`);
    let items = await response.json();

    if (!Array.isArray(items) || items.length === 0) {
        response = await apiFetch(`/api/menu?category=${encodeURIComponent(category)}`);
        items = await response.json();
    }

    const menuList = document.getElementById('menuList');
    if (!menuList) return;

    if (!items.length) {
        menuList.innerHTML = '<div style="color: var(--text-light);">Меню пока пустое</div>';
        return;
    }

    menuList.innerHTML = items.map(item => {
        const itemAllergens = parseAllergens(item.allergens);
        const matches = itemAllergens.filter(a => myAllergens.includes(a));
        const matchText = matches.join(', ');

        return `
            <div class="menu-item">
                <div class="menu-item-name">${escapeHtml(item.name)}</div>
                <div class="menu-item-name-footer">${escapeHtml(item.description || '')}</div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 8px; gap: 12px;">
                    <span class="menu-item-price">${item.price} ₽</span>
                    <div style="text-align: right;">
                        ${item.allergens ? `<div style="font-size: 11px; color: var(--warning);">${iconImg('warning','ui-icon ui-icon-sm')} ${escapeHtml(item.allergens)}</div>` : ''}
                        ${matches.length ? `<div class="allergen-alert">${iconImg('warning','ui-icon ui-icon-sm')} Ваш аллерген: ${escapeHtml(matchText)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


function _parseISODateToLocal(iso) {
    const parts = String(iso || '').split('-').map(Number);
    if (parts.length !== 3) return null;
    const [y, m, d] = parts;
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function _toISODateLocal(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function _formatIsoDateShort(iso) {
    const d = _parseISODateToLocal(iso);
    if (!d) return iso || '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
}

function setMenuCalendarView(view, el) {
    menuCalendarView = view === 'month' ? 'month' : 'week';

    document.querySelectorAll('#studentMenuSection .tab[data-view]').forEach(t => t.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else {
        document.querySelector(`#studentMenuSection .tab[data-view="${menuCalendarView}"]`)?.classList.add('active');
    }

    loadMenuCalendar();
}

function moveMenuCalendar(step) {
    if (step === 0) {
        menuCalendarAnchor = new Date();
        loadMenuCalendar();
        return;
    }

    if (menuCalendarView === 'week') {
        const d = new Date(menuCalendarAnchor);
        d.setDate(d.getDate() + (step * 7));
        menuCalendarAnchor = d;
    } else {
        const d = new Date(menuCalendarAnchor);
        const day = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + step);
        const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, maxDay));
        menuCalendarAnchor = d;
    }

    loadMenuCalendar();
}

async function loadMenuCalendar() {
    const container = document.getElementById('menuCalendar');
    const titleEl = document.getElementById('menuCalendarTitle');
    if (!container) return;

    container.innerHTML = `<div class="menu-calendar-empty">Загрузка...</div>`;
    if (titleEl) titleEl.textContent = '';

    const dateStr = _toISODateLocal(menuCalendarAnchor);

    try {
        const resp = await apiFetch(`/api/menu_calendar?view=${encodeURIComponent(menuCalendarView)}&date=${encodeURIComponent(dateStr)}`);
        const data = await resp.json();

        if (!resp.ok) {
            showNotification(data.error || 'Не удалось загрузить календарь', 'error');
            container.innerHTML = `<div class="menu-calendar-empty">Не удалось загрузить календарь</div>`;
            return;
        }

        renderMenuCalendar(data);
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="menu-calendar-empty">Ошибка загрузки календаря</div>`;
    }
}


function _toLocalISODate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function _addDaysLocal(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function getSubscriptionCoverageMap(subs) {
    const today = new Date();
    const todayIso = _toLocalISODate(today);

    let breakfastEnd = null;
    let lunchEnd = null;

    (Array.isArray(subs) ? subs : []).forEach(s => {
        const days = parseInt(s.days_remaining, 10);
        if (!Number.isFinite(days) || days <= 0) return;

        const endIso = _toLocalISODate(_addDaysLocal(today, days - 1));

        if (s.meal_type === 'breakfast' || s.meal_type === 'both') {
            if (!breakfastEnd || endIso > breakfastEnd) breakfastEnd = endIso;
        }
        if (s.meal_type === 'lunch' || s.meal_type === 'both') {
            if (!lunchEnd || endIso > lunchEnd) lunchEnd = endIso;
        }
    });

    return { todayIso, breakfastEnd, lunchEnd };
}

function renderSubscriptionCalendarInfo(subs) {
    const el = document.getElementById('subscriptionCalendarInfo');
    if (!el) return;

    const list = Array.isArray(subs) ? subs : [];
    if (!list.length) {
        el.innerHTML = '';
        return;
    }

    const today = new Date();
    const lines = [];

    list.forEach(s => {
        const days = parseInt(s.days_remaining, 10);
        if (!Number.isFinite(days) || days <= 0) return;

        const end = _addDaysLocal(today, days - 1);
        const endStr = end.toLocaleDateString('ru-RU');

        const label = s.meal_type === 'both'
            ? 'Завтрак + Обед'
            : (s.meal_type === 'breakfast' ? 'Завтрак' : 'Обед');

        lines.push(`${iconImg('ticket','ui-icon ui-icon-sm')} <b>${label}</b>: осталось <b>${days}</b> дн. (примерно до <b>${endStr}</b>)`);
    });

    el.innerHTML = lines.join('<br>');
}

function renderMenuCalendar(data) {
    const container = document.getElementById('menuCalendar');
    const titleEl = document.getElementById('menuCalendarTitle');
    if (!container) return;

    const days = Array.isArray(data.days) ? data.days : [];
    const todayIso = _toISODateLocal(new Date());

    try {
        renderSubscriptionCalendarInfo(activeSubscriptions);
    } catch (e) {
    }
    const coverage = getSubscriptionCoverageMap(activeSubscriptions);

    if (titleEl) {
        if (data && data.start && data.end) {
            const startStr = _formatIsoDateShort(data.start);
            const endStr = _formatIsoDateShort(data.end);
            const viewLabel = data.view === 'month' ? 'месяц' : 'неделя';
            titleEl.textContent = `Меню (${viewLabel}): ${startStr} — ${endStr}`;
        } else {
            titleEl.textContent = 'Меню';
        }
    }

    const view = data?.view === 'month' ? 'month' : 'week';
    const ref = data?.reference_date ? _parseISODateToLocal(data.reference_date) : null;
    const refMonth = ref ? ref.getMonth() : null;
    const refYear = ref ? ref.getFullYear() : null;

    container.innerHTML = days.map(dayObj => {
        const iso = dayObj.date;
        const d = _parseISODateToLocal(iso);
        const dateLabel = d ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : (iso || '');
        const dow = d ? d.toLocaleDateString('ru-RU', { weekday: 'short' }) : '';

        const isToday = (iso === todayIso);

        const isOutside = (view === 'month' && d && refMonth !== null && refYear !== null)
            ? (d.getMonth() !== refMonth || d.getFullYear() !== refYear)
            : false;

        const breakfastCovered = !!(coverage.breakfastEnd && iso >= coverage.todayIso && iso <= coverage.breakfastEnd);
        const lunchCovered = !!(coverage.lunchEnd && iso >= coverage.todayIso && iso <= coverage.lunchEnd);

        const breakfastHtml = renderCalendarMeal(dayObj.breakfast, 'Завтрак', false, breakfastCovered);
        const lunchHtml = renderCalendarMeal(dayObj.lunch, 'Обед', true, lunchCovered);

        return `
            <div class="menu-calendar-day ${isToday ? 'today' : ''} ${isOutside ? 'outside' : ''}">
                <div class="menu-calendar-date">
                    <span>${escapeHtml(dateLabel)}</span>
                    <span class="menu-calendar-weekday">${escapeHtml(dow)}</span>
                </div>
                ${breakfastHtml}
                ${lunchHtml}
            </div>
        `;
    }).join('');
}


function renderCalendarMeal(items, title, isLunch, isCovered = false) {
    const coveredCls = isCovered ? ' subscription-active' : '';
    const mealCls = isLunch ? ' lunch' : ' breakfast';
    const titleCls = isLunch ? ' lunch' : '';
    const badge = isCovered ? '<span class="subscription-badge">Абон.</span>' : '';

    let html = `<div class="menu-calendar-meal${mealCls}${coveredCls}">`;
    html += `<div class="menu-calendar-meal-title${titleCls}">${escapeHtml(title)}${badge}</div>`;

    if (!items || items.length === 0) {
        html += `
            <div class="menu-calendar-item menu-calendar-item-empty">
                <span class="menu-calendar-item-name" style="color: var(--text-muted);">Нет блюд</span>
            </div>
        `;
    } else {
        items.forEach(item => {
            html += `
                <div class="menu-calendar-item">
                    <span class="menu-calendar-item-name">${escapeHtml(item.name)}</span>
                    <span class="menu-calendar-item-price">${escapeHtml(item.price)} ₽</span>
                </div>
            `;
        });
    }

    html += `</div>`;
    return html;
}


function _parseRubles(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/[^0-9.,-]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
}

function _formatRubles(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0 ₽';
    const isInt = Math.abs(n - Math.round(n)) < 1e-9;
    return (isInt ? Math.round(n).toString() : n.toFixed(2)) + ' ₽';
}

function _flashHeaderBalanceDelta(oldBalance, newBalance) {
    const headerEl = document.getElementById('headerBalance');
    const deltaEl = document.getElementById('headerBalanceDelta');
    if (!headerEl || !deltaEl) return;

    if (!Number.isFinite(oldBalance) || !Number.isFinite(newBalance)) {
        deltaEl.classList.add('hidden');
        return;
    }

    const delta = newBalance - oldBalance;
    if (Math.abs(delta) < 1e-9) {
        deltaEl.classList.add('hidden');
        return;
    }

    const deltaRounded = Math.round(delta * 100) / 100;

    deltaEl.classList.remove('positive', 'negative', 'hidden');
    deltaEl.classList.add(deltaRounded >= 0 ? 'positive' : 'negative');
    deltaEl.textContent = (deltaRounded >= 0 ? '+' : '−') + Math.abs(deltaRounded).toString().replace('.', ',') + ' ₽';

    headerEl.classList.remove('balance-flash');

    void headerEl.offsetWidth;
    headerEl.classList.add('balance-flash');

    window.setTimeout(() => {
        deltaEl.classList.add('hidden');
    }, 2500);
}

function _setHeaderBalance(balance, opts = {}) {
    const headerEl = document.getElementById('headerBalance');
    if (!headerEl) return;

    const old = Number.isFinite(opts.oldBalance) ? opts.oldBalance : (_lastKnownBalance ?? _parseRubles(headerEl.textContent));
    headerEl.textContent = _formatRubles(balance);

    const newBal = Number(balance);
    if (Number.isFinite(newBal)) {
        _lastKnownBalance = newBal;
    }

    if (opts.flash !== false && Number.isFinite(old) && Number.isFinite(newBal)) {
        _flashHeaderBalanceDelta(old, newBal);
    }
}

async function updateHeaderBalance(opts = {}) {

    if (currentRole !== 'student') return null;

    try {
        const old = _lastKnownBalance ?? _parseRubles(document.getElementById('headerBalance')?.textContent);
        const resp = await apiFetch('/api/balance');
        if (!resp.ok) return null;
        const data = await resp.json();
        _setHeaderBalance(data.balance, { flash: opts.flash ?? false, oldBalance: old });
        return data.balance;
    } catch (e) {
        return null;
    }
}


async function loadBalanceAndSubscriptions(opts = {}) {

    if (currentRole !== 'student') return null;

    const oldHeader = _lastKnownBalance ?? _parseRubles(document.getElementById('headerBalance')?.textContent);

    const response = await apiFetch('/api/balance');
    if (!response.ok) return null;

    const data = await response.json();

    const balanceEl = document.getElementById('balanceDisplay');
    if (balanceEl) balanceEl.textContent = _formatRubles(data.balance);

    _setHeaderBalance(data.balance, { flash: opts.flash ?? false, oldBalance: oldHeader });

    const infoEl = document.getElementById('subscriptionInfo');

    try {
        const subsResp = await apiFetch('/api/subscriptions');
        const subs = await subsResp.json();
        activeSubscriptions = Array.isArray(subs) ? subs : [];

        if (infoEl) {
            if (!activeSubscriptions.length) {
                infoEl.innerHTML = 'Активных абонементов нет';
            } else {
                infoEl.innerHTML = activeSubscriptions.map(s => {
                    const label = s.meal_type === 'both'
                        ? 'Завтрак + Обед'
                        : (s.meal_type === 'breakfast' ? 'Завтрак' : 'Обед');
                    return `Абонемент: <b>${label}</b> — осталось <b>${s.days_remaining}</b> дн.`;
                }).join('<br>');
            }
        }

        if (document.getElementById('subscriptionCalendarInfo')) {
            renderSubscriptionCalendarInfo(activeSubscriptions);
        }

        const menuSection = document.getElementById('studentMenuSection');
        if (menuSection && !menuSection.classList.contains('hidden')) {
            try {
                await loadMenuCalendar();
            } catch (err) {

            }
        }
    } catch (e) {
        activeSubscriptions = [];
        if (infoEl) infoEl.innerHTML = '';
        if (document.getElementById('subscriptionCalendarInfo')) {
            renderSubscriptionCalendarInfo([]);
        }
    }

    return data.balance;
}


async function handlePaymentSubmit(e) {
    e.preventDefault();

    let cards = Array.isArray(userCards) ? userCards : [];
    if (!cards.length) {
        try {
            const raw = (typeof _safeLocalStorageGet === 'function')
                ? _safeLocalStorageGet(_getUserCardsStorageKey())
                : (window.localStorage ? window.localStorage.getItem(_getUserCardsStorageKey()) : null);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) cards = parsed;
        } catch (err) {
            cards = [];
        }
    }

    if (!cards.length) {
        showNotification('Сначала добавьте карту — без карты пополнить баланс нельзя.', 'error');
        if (typeof showAddCardForm === 'function') showAddCardForm();
        if (typeof syncPaymentCardRequirementUI === 'function') syncPaymentCardRequirementUI();
        return;
    }

    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData);

    let selectedCard = null;
    try {
        if (cards.length === 1) {
            selectedCard = cards[0];
        } else {
            const sel = document.getElementById('paymentCardSelect');
            let selectedId = sel ? String(sel.value || '') : '';

            if (!selectedId && typeof _getSelectedPaymentCardId === 'function') {
                selectedId = _getSelectedPaymentCardId();
            }

            selectedCard = cards.find(c => String(c.id || '') === String(selectedId)) || null;

            if (!selectedCard) selectedCard = cards[0] || null;
        }
    } catch (e) {
        selectedCard = cards[0] || null;
    }

    if (!selectedCard) {
        showNotification('Не удалось определить карту для оплаты. Удалите карту и добавьте заново.', 'error');
        return;
    }

    payload.card_id = String(selectedCard.id || '');
    payload.card_last4 = String(selectedCard.last4 || '').slice(-4);
    if (payload.card_id && typeof _setSelectedPaymentCardId === 'function') {
        _setSelectedPaymentCardId(payload.card_id);
    }

    if (payload.payment_type === 'subscription') {
        if (!subscriptionPricing) {
            await loadPricing();
        }

        const days = parseInt(payload.days, 10);
        if (!Number.isFinite(days) || days <= 0) {
            showNotification('Введите корректное количество дней', 'error');
            return;
        }
        const dayPrice = subscriptionPricing?.[payload.meal_type] ?? 0;
        payload.amount = days * dayPrice;
    }

    payload.amount = parseFloat(payload.amount);
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        showNotification('Введите корректную сумму', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await apiFetch('/api/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();

            if (result && Number.isFinite(Number(result.balance))) {
                const newBal = Number(result.balance);
                _setHeaderBalance(newBal, {
                    flash: true,
                    oldBalance: _lastKnownBalance
                });
                const bd = document.getElementById('balanceDisplay');
                if (bd) bd.textContent = _formatRubles(newBal);
            }

            await loadBalanceAndSubscriptions({ flash: true });

            e.target.reset();
            showNotification(result.message || 'Оплата успешна', 'success');

            const paymentTypeSelect = document.getElementById('paymentTypeSelect');
            if (paymentTypeSelect) paymentTypeSelect.dispatchEvent(new Event('change'));

            if (typeof syncPaymentCardRequirementUI === 'function') syncPaymentCardRequirementUI();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Ошибка оплаты', 'error');
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}


async function claimMeal(type, menuItemId = null) {
    const payload = { meal_type: type };
    if (menuItemId !== null && menuItemId !== undefined && Number.isFinite(Number(menuItemId))) {
        payload.menu_item_id = Number(menuItemId);
    }

    const response = await apiFetch('/api/claim_meal', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
        showNotification('Питание отмечено', 'success');
        loadBalanceAndSubscriptions();
    } else {
        showNotification(data.error || 'Ошибка', 'error');
    }
}

async function refreshMyAllergens() {
    try {
        const response = await apiFetch('/api/allergies');
        const allergies = await response.json();
        myAllergens = Array.from(new Set(
            (allergies || []).map(a => normalizeAllergen(a.allergen)).filter(Boolean)
        ));
    } catch (e) {
        myAllergens = [];
    }
}

async function loadAllergies() {
    await refreshMyAllergens();

    const container = document.getElementById('allergenCheckboxes');
    const statusEl = document.getElementById('allergiesSaveStatus');
    if (!container) return;

    const selected = new Set(myAllergens);

    container.innerHTML = ALLERGEN_OPTIONS.map(a => {
        const val = normalizeAllergen(a);
        const checked = selected.has(val);
        return `
            <label class="allergen-option ${checked ? 'checked' : ''}">
                <input type="checkbox" value="${escapeHtml(val)}" ${checked ? 'checked' : ''}>
                <span>${escapeHtml(capitalize(val))}</span>
            </label>
        `;
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            cb.closest('.allergen-option')?.classList.toggle('checked', cb.checked);
        });
    });

    if (statusEl) {
        statusEl.textContent = myAllergens.length
            ? `Выбрано: ${myAllergens.join(', ')}`
            : 'Аллергены не выбраны';
    }
}

async function handleAllergySubmit(e) {
    e.preventDefault();

    const container = document.getElementById('allergenCheckboxes');
    if (!container) return;

    const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => normalizeAllergen(cb.value))
        .filter(Boolean);

    const response = await apiFetch('/api/allergies', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({allergens: selected})
    });

    if (response.ok) {
        showNotification('Аллергены сохранены', 'success');
        await refreshMyAllergens();
        loadAllergies();
        loadMenu(currentMealCategory);
    } else {
        const err = await response.json();
        showNotification(err.error || 'Ошибка', 'error');
    }
}

async function loadPreferences() {
    const input = document.getElementById('preferencesInput');
    if (!input) return;

    const response = await apiFetch('/api/preferences');
    const data = await response.json();
    input.value = data.preferences || '';
}

async function handlePreferencesSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData);

    const response = await apiFetch('/api/preferences', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        showNotification('Предпочтения сохранены', 'success');
    } else {
        const err = await response.json();
        showNotification(err.error || 'Ошибка', 'error');
    }
}

async function loadMenuForReview() {
    const response = await apiFetch('/api/menu?category=breakfast');
    const breakfastItems = await response.json();
    const response2 = await apiFetch('/api/menu?category=lunch');
    const lunchItems = await response2.json();

    const select = document.getElementById('reviewMenuSelect');
    if (!select) return;

    select.innerHTML = [
        ...breakfastItems.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (Завтрак)</option>`),
        ...lunchItems.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (Обед)</option>`)
    ].join('');
}

async function handleReviewSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData);

    payload.menu_item_id = parseInt(payload.menu_item_id, 10);
    payload.rating = parseInt(payload.rating, 10);

    const response = await apiFetch('/api/reviews', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        showNotification('Отзыв отправлен', 'success');
        e.target.reset();
        loadIssueMenuOptions();
        loadReviews();
    } else {
        const err = await response.json();
        showNotification(err.error || 'Ошибка', 'error');
    }
}

async function loadReviews() {
    const listEl = document.getElementById('reviewsList');
    if (!listEl) return;

    const response = await apiFetch('/api/reviews');
    const reviews = await response.json();

    if (!reviews.length) {
        listEl.innerHTML = '<div style="color: var(--text-light);">Отзывов пока нет</div>';
        return;
    }

    listEl.innerHTML = reviews.slice(0, 10).map(r => {
        const rating = Number.isFinite(Number(r.rating)) ? Number(r.rating) : 0;
        return `
            <div class="menu-item review-item">
                <div class="review-header">
                    <div>
                        <div class="menu-item-name">${escapeHtml(r.dish_name || '')}</div>
                        <div class="review-meta">${escapeHtml(r.full_name || '')} • ${new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div class="badge badge-success rating-badge" title="Оценка: ${rating}">${iconImg('star','ui-icon ui-icon-sm')} ${rating}/5</div>
                </div>
                ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function showCookSection(section, el) {
    document.querySelectorAll('#cookDashboard .nav-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');

    document.querySelectorAll('#cookDashboard > div[id$="Section"]').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(`cook${capitalize(section)}Section`);
    if (target) target.classList.remove('hidden');

    if (section === 'stats') loadMealStats();
    if (section === 'products') loadProducts();
    if (section === 'requests') {
        loadCookRequests();
        loadProductsForPurchaseRequestForm();
    }
    if (section === 'notifications') {
        loadNotifications();
    }
}

async function loadMealStats() {
    const response = await apiFetch('/api/meal_stats');
    const stats = await response.json();

    const breakfastStat = stats.find(s => s.meal_type === 'breakfast');
    const lunchStat = stats.find(s => s.meal_type === 'lunch');

    const bEl = document.getElementById('breakfastCount');
    const lEl = document.getElementById('lunchCount');

    if (bEl) bEl.textContent = breakfastStat ? breakfastStat.count : 0;
    if (lEl) lEl.textContent = lunchStat ? lunchStat.count : 0;
}


let _cookMealHistoryCache = [];

function _syncCookHistoryPeriodUI() {
    const periodSelect = document.getElementById('cookHistoryPeriodSelect');
    const customGroup = document.getElementById('cookHistoryCustomDaysGroup');
    const customInput = document.getElementById('cookHistoryCustomDaysInput');

    if (!periodSelect) return;

    const val = periodSelect.value;
    const isCustom = val === 'custom';

    if (customGroup) {
        customGroup.style.display = isCustom ? 'block' : 'none';
    }

    if (isCustom && customInput) {
        const v = parseInt(customInput.value || '7', 10);
        if (!Number.isFinite(v) || v < 1) customInput.value = '7';
        if (v > 365) customInput.value = '365';
    }
}

function _getCookHistoryDays() {
    const periodSelect = document.getElementById('cookHistoryPeriodSelect');
    const customInput = document.getElementById('cookHistoryCustomDaysInput');

    if (!periodSelect) return 7;

    if (periodSelect.value === 'custom') {
        const v = customInput ? parseInt(customInput.value || '7', 10) : 7;
        if (Number.isFinite(v)) {
            return Math.max(1, Math.min(v, 365));
        }
        return 7;
    }

    const v = parseInt(periodSelect.value || '7', 10);
    if (Number.isFinite(v)) {
        return Math.max(1, Math.min(v, 365));
    }
    return 7;
}

function onCookHistoryPeriodChange() {
    _syncCookHistoryPeriodUI();
    loadCookMealHistory();
}

function _cookHistoryBadge(received) {
    if (received === 1 || received === true) return '<span class="badge badge-success">Получил</span>';
    if (received === 0 || received === false) return '<span class="badge badge-danger">Не получил</span>';
    return '<span class="badge badge-warning">Ожидает</span>';
}

async function loadCookMealHistory() {
    const table = document.getElementById('cookHistoryTable');
    if (!table) return;

    const summaryEl = document.getElementById('cookHistorySummary');

    _syncCookHistoryPeriodUI();

    table.innerHTML = `
        <thead>
            <tr>
                <th>Дата/время</th>
                <th>Ученик</th>
                <th>Тип</th>
                <th>Блюдо</th>
                <th>Выдал</th>
                <th>Подтверждение</th>
            </tr>
        </thead>
        <tbody>
            <tr><td colspan="6">Загрузка...</td></tr>
        </tbody>
    `;
    if (summaryEl) summaryEl.textContent = 'Загрузка...';

    const days = _getCookHistoryDays();
    const mealType = document.getElementById('cookHistoryMealTypeSelect')?.value || '';
    const scope = document.getElementById('cookHistoryScopeSelect')?.value || 'all';

    const params = new URLSearchParams();
    params.set('days', String(days));
    params.set('limit', '500');
    if (mealType) params.set('meal_type', mealType);
    if (scope) params.set('scope', scope);

    try {
        const resp = await apiFetch(`/api/cook/meal-history?${params.toString()}`);
        const data = await resp.json();

        if (!resp.ok) {
            throw new Error((data && data.error) ? data.error : 'Не удалось загрузить историю');
        }

        const items = Array.isArray(data) ? data : (data.items || []);
        const summary = (data && data.summary) ? data.summary : null;

        _cookMealHistoryCache = Array.isArray(items) ? items : [];
        renderCookMealHistory(_cookMealHistoryCache, summary);
    } catch (e) {
        console.error(e);
        if (summaryEl) summaryEl.textContent = 'Не удалось загрузить историю выдачи';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Дата/время</th>
                    <th>Ученик</th>
                    <th>Тип</th>
                    <th>Блюдо</th>
                    <th>Выдал</th>
                    <th>Подтверждение</th>
                </tr>
            </thead>
            <tbody>
                <tr><td colspan="6">Ошибка загрузки</td></tr>
            </tbody>
        `;
    }
}

function renderCookMealHistory(items, summary = null) {
    const table = document.getElementById('cookHistoryTable');
    if (!table) return;

    const summaryEl = document.getElementById('cookHistorySummary');

    const list = Array.isArray(items) ? items : [];

    let total = list.length;
    let breakfast = 0;
    let lunch = 0;
    let pending = 0;
    let yes = 0;
    let no = 0;

    list.forEach(r => {
        const mt = r.meal_type;
        if (mt === 'breakfast') breakfast += 1;
        if (mt === 'lunch') lunch += 1;

        const rec = r.student_received;
        if (rec === 1 || rec === true) yes += 1;
        else if (rec === 0 || rec === false) no += 1;
        else pending += 1;
    });

    if (summary && typeof summary === 'object') {
        total = Number.isFinite(Number(summary.total)) ? Number(summary.total) : total;
        breakfast = Number.isFinite(Number(summary.breakfast)) ? Number(summary.breakfast) : breakfast;
        lunch = Number.isFinite(Number(summary.lunch)) ? Number(summary.lunch) : lunch;
        pending = Number.isFinite(Number(summary.pending_confirmation)) ? Number(summary.pending_confirmation) : pending;
        yes = Number.isFinite(Number(summary.received_yes)) ? Number(summary.received_yes) : yes;
        no = Number.isFinite(Number(summary.received_no)) ? Number(summary.received_no) : no;
    }

    if (summaryEl) {
        summaryEl.textContent = `Записей: ${total}. Завтраков: ${breakfast}, обедов: ${lunch}. Подтверждение: ожидает ${pending}, получил ${yes}, не получил ${no}.`;
    }

    if (list.length === 0) {
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Дата/время</th>
                    <th>Ученик</th>
                    <th>Тип</th>
                    <th>Блюдо</th>
                    <th>Выдал</th>
                    <th>Подтверждение</th>
                </tr>
            </thead>
            <tbody>
                <tr><td colspan="6">Нет записей за выбранный период</td></tr>
            </tbody>
        `;
        return;
    }

    table.innerHTML = `
        <thead>
            <tr>
                <th>Дата/время</th>
                <th>Ученик</th>
                <th>Тип</th>
                <th>Блюдо</th>
                <th>Выдал</th>
                <th>Подтверждение</th>
            </tr>
        </thead>
        <tbody>
            ${list.map(r => {
                const time = escapeHtml(_formatDateTimeFromTs(r.claimed_at));
                const studentName = escapeHtml(r.student_name || r.student_username || '—');
                const studentExtraParts = [];
                if (r.school) studentExtraParts.push(r.school);
                if (r.class_name) studentExtraParts.push(r.class_name);
                const studentExtra = escapeHtml(studentExtraParts.join(' · '));

                const type = escapeHtml(_mealTypeLabel(r.meal_type));
                const dish = escapeHtml(r.dish_name || '—');
                const issuer = escapeHtml(r.issuer_name || '—');

                const badge = _cookHistoryBadge(r.student_received);
                const markedAt = r.student_marked_at ? escapeHtml(_formatDateTimeFromTs(r.student_marked_at)) : '';
                const markedHtml = markedAt ? `<div class="form-hint" style="margin-top: 4px;">отметил: ${markedAt}</div>` : '';

                return `
                    <tr>
                        <td>${time}</td>
                        <td>
                            <div><b>${studentName}</b></div>
                            ${studentExtra ? `<div class="form-hint" style="margin-top: 4px;">${studentExtra}</div>` : ''}
                        </td>
                        <td>${type}</td>
                        <td>${dish}</td>
                        <td>${issuer}</td>
                        <td>${badge}${markedHtml}</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    `;
}


let _dishControlCache = [];
let _dishControlFilter = 'all';
let _dishControlQuery = '';

function _dishCategoryLabel(cat) {
    if (cat === 'breakfast') return 'Завтрак';
    if (cat === 'lunch') return 'Обед';
    return cat || '';
}

function setDishControlFilter(filter) {
    _dishControlFilter = filter || 'all';
    renderDishControlList();
}

function setDishControlQuery(q) {
    _dishControlQuery = String(q || '');
    renderDishControlList();
}

function renderDishControlList() {
    const container = document.getElementById('dishControlList');
    if (!container) return;

    const allDishes = Array.isArray(_dishControlCache) ? _dishControlCache : [];
    const total = allDishes.length;
    const availableCount = allDishes.filter(d => !!d.available).length;

    const q = _dishControlQuery.trim().toLowerCase();

    const filtered = allDishes.filter(d => {
        if (_dishControlFilter !== 'all' && String(d.category) !== _dishControlFilter) return false;
        if (!q) return true;
        const text = `${d.name || ''} ${d.description || ''} ${d.allergens || ''}`.toLowerCase();
        return text.includes(q);
    });

    const filterBtn = (id, label) => {
        const active = _dishControlFilter === id;
        return `<button class="btn btn-secondary btn-small ${active ? 'active' : ''}" type="button" onclick="setDishControlFilter('${id}')">${label}</button>`;
    };

    const toolbar = `
        <div class="dish-control-toolbar">
            <div class="dish-control-stats">
                <b>Всего:</b> ${total} · <b>Доступно:</b> ${availableCount}
            </div>
            <div class="dish-control-filters">
                ${filterBtn('all', 'Все')}
                ${filterBtn('breakfast', 'Завтраки')}
                ${filterBtn('lunch', 'Обеды')}
            </div>
            <div class="dish-control-search">
                <input class="form-input" type="text" placeholder="Поиск блюда..." value="${escapeHtml(_dishControlQuery)}" oninput="setDishControlQuery(this.value)">
            </div>
        </div>
    `;

    if (filtered.length === 0) {
        container.innerHTML = toolbar + `<div class="empty-state">Блюда не найдены</div>`;
        return;
    }

    const grid = `
        <div class="dish-control-grid">
            ${filtered.map(d => {
                const isAvail = !!d.available;
                const badge = isAvail
                    ? '<span class="badge badge-success">Доступно</span>'
                    : '<span class="badge badge-danger">Скрыто</span>';

                const price = (d.price !== null && d.price !== undefined) ? `${d.price} ₽` : '—';
                const desc = d.description ? `<div class="dish-control-desc">${escapeHtml(d.description)}</div>` : '';
                const allergens = d.allergens ? `<div class="dish-control-allergens"><b>Аллергены:</b> ${escapeHtml(d.allergens)}</div>` : '';
                const ingredientsArr = Array.isArray(d.ingredients) ? d.ingredients : [];
                const ingredientsText = ingredientsArr.map(i => {
                    const n = String(i?.product_name || i?.name || '').trim();
                    const qn = Number(i?.quantity);
                    const q = Number.isFinite(qn) ? round2(qn) : (i?.quantity ?? '');
                    const u = String(i?.unit || '').trim();
                    const part = `${n} — ${q} ${u}`.trim();
                    return part;
                }).filter(Boolean).join(', ');
                const ingredients = ingredientsText ? `<div class="dish-control-ingredients"><b>Ингредиенты:</b> ${escapeHtml(ingredientsText)}</div>` : '';


                const btnClass = isAvail ? 'btn-danger' : 'btn-success';
                const btnText = isAvail ? 'Сделать недоступным' : 'Сделать доступным';

                return `
                    <div class="dish-control-item">
                        <div class="dish-control-header">
                            <div>
                                <div class="dish-control-name">${escapeHtml(d.name || '')}</div>
                                <div class="dish-control-meta">${escapeHtml(_dishCategoryLabel(d.category))} · ${price}</div>
                            </div>
                            <div class="dish-control-badge">${badge}</div>
                        </div>
                        ${desc}
                        ${allergens}
                        ${ingredients}
                        <div class="dish-control-actions">
                            <button class="btn ${btnClass} btn-small" type="button" onclick="toggleDishAvailabilityUI(${d.id})">${btnText}</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    container.innerHTML = toolbar + grid;
}

async function loadDishControl() {
    const container = document.getElementById('dishControlList');
    if (!container) return;

    container.innerHTML = `<div class="empty-state">Загрузка...</div>`;

    try {
        const resp = await apiFetch('/api/cook/dishes');
        const data = await resp.json();

        if (!resp.ok) {
            throw new Error(data?.error || 'Не удалось загрузить блюда');
        }

        _dishControlCache = Array.isArray(data) ? data : (data.dishes || []);
        renderDishControlList();
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="empty-state">Не удалось загрузить блюда</div>`;
    }
}

async function toggleDishAvailabilityUI(dishId) {
    const id = parseInt(dishId, 10);
    if (!Number.isFinite(id)) return;

    const dish = Array.isArray(_dishControlCache)
        ? _dishControlCache.find(d => Number(d.id) === id)
        : null;
    if (!dish) return;

    const nextAvailable = !dish.available;

    try {
        const resp = await apiFetch(`/api/cook/dishes/${id}/availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ available: nextAvailable })
        });

        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data?.error || 'Ошибка обновления');
        }

        dish.available = nextAvailable;
        showNotification(data?.message || 'Обновлено', 'success');
        renderDishControlList();
    } catch (e) {
        console.error(e);
        showNotification('Не удалось обновить доступность блюда', 'error');
    }
}

window.setDishControlFilter = setDishControlFilter;
window.setDishControlQuery = setDishControlQuery;
window.toggleDishAvailabilityUI = toggleDishAvailabilityUI;


async function _ensureDishProductsCache(force = false) {
    if (_dishProductsCache && !force) return _dishProductsCache;

    try {
        const resp = await apiFetch('/api/products');
        const data = await resp.json();

        if (resp.ok && Array.isArray(data)) {
            _dishProductsCache = data;
            return _dishProductsCache;
        }
    } catch (e) {
        console.error(e);
    }

    _dishProductsCache = [];
    return _dishProductsCache;
}

function _dishFindProductById(id) {
    const pid = Number(id);
    if (!Array.isArray(_dishProductsCache)) return null;
    return _dishProductsCache.find(p => Number(p.id) === pid) || null;
}

async function addDishIngredientRow(preset = null) {
    const list = document.getElementById('dishIngredientsList');
    if (!list) return;

    const products = await _ensureDishProductsCache();
    if (!products.length) {
        showNotification('Нет списка продуктов. Сначала добавьте продукты в разделе «Продукты».', 'error');
        return;
    }

    const rowId = ++_dishIngredientRowSeq;

    const row = document.createElement('div');
    row.className = 'dish-ingredient-row';
    row.dataset.rowId = String(rowId);

    const select = document.createElement('select');
    select.className = 'form-select dish-ingredient-product';

    products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = String(p.id);
        const unit = p.unit ? ` (${p.unit})` : '';
        opt.textContent = `${p.name || ''}${unit}`;
        select.appendChild(opt);
    });

    if (preset && preset.product_id) {
        select.value = String(preset.product_id);
    }

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'form-input dish-ingredient-qty';
    qtyInput.min = '0.001';
    qtyInput.step = '0.001';
    qtyInput.placeholder = '0';

    if (preset && preset.quantity !== undefined && preset.quantity !== null) {
        qtyInput.value = String(preset.quantity);
    }

    const unitEl = document.createElement('span');
    unitEl.className = 'dish-ingredient-unit';

    const syncUnit = () => {
        const p = _dishFindProductById(select.value);
        unitEl.textContent = p?.unit ? String(p.unit) : '';
    };
    select.addEventListener('change', syncUnit);
    syncUnit();

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-danger btn-small';
    removeBtn.textContent = '×';
    removeBtn.title = 'Удалить ингредиент';
    removeBtn.addEventListener('click', () => {
        row.remove();
    });

    row.appendChild(select);
    row.appendChild(qtyInput);
    row.appendChild(unitEl);
    row.appendChild(removeBtn);

    list.appendChild(row);
}

async function initDishCreateForm() {
    const form = document.getElementById('dishCreateForm');
    if (!form || _dishCreateInitialized) return;

    _dishCreateInitialized = true;

    await _ensureDishProductsCache();
    const list = document.getElementById('dishIngredientsList');
    if (list && list.children.length === 0) {
        await addDishIngredientRow();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const statusEl = document.getElementById('dishCreateStatus');
        if (statusEl) statusEl.textContent = '';

        const name = document.getElementById('dishCreateName')?.value?.trim() || '';
        const category = document.getElementById('dishCreateCategory')?.value || 'breakfast';
        const priceRaw = document.getElementById('dishCreatePrice')?.value;
        const description = document.getElementById('dishCreateDescription')?.value?.trim() || '';
        const allergens = document.getElementById('dishCreateAllergens')?.value?.trim() || '';

        const price = Number(priceRaw);
        if (!name) {
            if (statusEl) statusEl.textContent = 'Укажите название блюда';
            showNotification('Укажите название блюда', 'error');
            return;
        }
        if (!Number.isFinite(price) || price < 0) {
            if (statusEl) statusEl.textContent = 'Некорректная цена';
            showNotification('Некорректная цена', 'error');
            return;
        }

        const ingredients = [];
        const rows = list ? Array.from(list.querySelectorAll('.dish-ingredient-row')) : [];

        for (const row of rows) {
            const select = row.querySelector('select.dish-ingredient-product');
            const qtyInput = row.querySelector('input.dish-ingredient-qty');
            if (!select || !qtyInput) continue;

            const pid = parseInt(select.value || '0', 10);
            const qty = Number(qtyInput.value);

            if (!Number.isFinite(pid) || pid <= 0) continue;
            if (!Number.isFinite(qty) || qty <= 0) continue;

            ingredients.push({ product_id: pid, quantity: qty });
        }

        if (!ingredients.length) {
            if (statusEl) statusEl.textContent = 'Добавьте хотя бы один ингредиент с количеством';
            showNotification('Добавьте хотя бы один ингредиент с количеством', 'error');
            return;
        }

        try {
            const resp = await apiFetch('/api/cook/dishes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    category,
                    price,
                    description,
                    allergens,
                    ingredients
                })
            });

            const data = await resp.json();

            if (!resp.ok) {
                const msg = data?.error || 'Не удалось создать блюдо';
                if (statusEl) statusEl.textContent = msg;
                showNotification(msg, 'error');
                return;
            }

            showNotification(data?.message || 'Блюдо создано', 'success');
            if (statusEl) statusEl.textContent = 'Блюдо создано';

            try { form.reset(); } catch (e) { /* ignore */ }
            if (list) {
                list.innerHTML = '';
                await addDishIngredientRow();
            }

            if (typeof loadDishControl === 'function') {
                await loadDishControl();
            }
        } catch (e) {
            console.error(e);
            const msg = 'Не удалось создать блюдо';
            if (statusEl) statusEl.textContent = msg;
            showNotification(msg, 'error');
        }
    });
}

window.addDishIngredientRow = addDishIngredientRow;

async function loadProducts() {
    const response = await apiFetch('/api/products');
    const products = await response.json();

    const table = document.getElementById('productsTable');
    if (!table) return;

    table.innerHTML = `
        <thead>
            <tr>
                <th>Продукт</th>
                <th>Количество</th>
                <th>Мин. остаток</th>
                <th>Статус</th>
            </tr>
        </thead>
        <tbody>
            ${products.map(p => `
                <tr>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${formatQty(p.quantity)} ${escapeHtml(p.unit)}</td>
                    <td>${formatQty(p.min_quantity)} ${escapeHtml(p.unit)}</td>
                    <td>
                        ${Number(p.quantity) < Number(p.min_quantity)
                            ? '<span class="badge badge-danger">Требуется закупка</span>'
                            : '<span class="badge badge-success">В норме</span>'
                        }
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
}


let _purchaseProductsCache = null;

async function loadProductsForPurchaseRequestForm() {
    const select = document.getElementById('purchaseProductSelect');
    const unitInput = document.getElementById('purchaseUnitInput');
    const hint = document.getElementById('purchaseProductHint');

    if (!select || !unitInput) return;

    try {
        const response = await apiFetch('/api/products');
        const products = await response.json();
        _purchaseProductsCache = Array.isArray(products) ? products : [];

        const currentValue = select.value;

        const optionsHtml = _purchaseProductsCache.map(p => {
            const name = escapeHtml(p.name);
            const unit = escapeHtml(p.unit);
            const qty = (p.quantity === null || p.quantity === undefined) ? '' : formatQty(p.quantity);
            return `<option value="${p.id}" data-unit="${unit}" data-qty="${qty}">${name} (${qty} ${unit})</option>`;
        }).join('');

        select.innerHTML = `<option value="" disabled ${!currentValue ? 'selected' : ''}>Выберите продукт</option>` + optionsHtml;

        if (currentValue && _purchaseProductsCache.some(p => String(p.id) === String(currentValue))) {
            select.value = currentValue;
        } else {
            select.value = '';
            unitInput.value = '';
            if (hint) hint.textContent = '';
        }

        if (select.dataset.bound !== '1') {
            select.dataset.bound = '1';
            select.addEventListener('change', () => {
                const opt = select.options[select.selectedIndex];
                const unit = opt?.getAttribute('data-unit') || '';
                const qty = opt?.getAttribute('data-qty') || '';
                unitInput.value = unit;
                if (hint) {
                    hint.textContent = (qty !== '') ? `Текущий остаток: ${qty} ${unit}` : '';
                }
            });
        }

        if (select.value) {
            select.dispatchEvent(new Event('change'));
        }
    } catch (e) {
        console.error(e);
        showNotification('Не удалось загрузить список продуктов', 'error');
    }
}

async function handlePurchaseRequestSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData);
    payload.product_id = parseInt(payload.product_id, 10);
    if (!Number.isFinite(payload.product_id)) {
        showNotification('Выберите продукт', 'error');
        return;
    }

    payload.quantity = parseFloat(payload.quantity);
    if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
        showNotification('Введите корректное количество', 'error');
        return;
    }

    if (payload.estimated_cost) {
        payload.estimated_cost = parseFloat(payload.estimated_cost);
        if (!Number.isFinite(payload.estimated_cost)) payload.estimated_cost = 0;
    }

    const response = await apiFetch('/api/purchase_request', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        showNotification('Заявка создана', 'success');
        loadCookRequests();

        e.target.reset();
        loadIssueMenuOptions();
        const unitInput = document.getElementById('purchaseUnitInput');
        const hint = document.getElementById('purchaseProductHint');
        if (unitInput) unitInput.value = '';
        if (hint) hint.textContent = '';
    } else {
        const err = await response.json();
        showNotification(err.error || 'Ошибка', 'error');
    }
}


async function loadCookRequests() {
    const response = await apiFetch('/api/purchase_requests');
    const requests = await response.json();

    const table = document.getElementById('requestsTable');
    if (!table) return;

    table.innerHTML = `
        <thead>
            <tr>
                <th>Продукт</th>
                <th>Количество</th>
                <th>Стоимость</th>
                <th>Дата</th>
                <th>Статус</th>
            </tr>
        </thead>
        <tbody>
            ${requests.map(r => `
                <tr>
                    <td>${escapeHtml(r.product_name)}</td>
                    <td>${formatQty(r.quantity)} ${escapeHtml(r.unit)}</td>
                    <td>${r.estimated_cost ? `${r.estimated_cost} ₽` : '-'}</td>
                    <td>${new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                        ${r.status === 'pending' ? '<span class="badge badge-warning">Ожидает</span>' :
                            r.status === 'approved' ? '<span class="badge badge-success">Одобрено</span>' :
                            '<span class="badge badge-danger">Отклонено</span>'}
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
}


function _getNotificationBadgeEl() {
    if (currentRole === 'student') return document.getElementById('studentNotifBadge');
    if (currentRole === 'cook') return document.getElementById('cookNotifBadge');
    if (currentRole === 'admin') return document.getElementById('adminNotifBadge');
    return null;
}


async function refreshNotificationBadge() {
    const badge = _getNotificationBadgeEl();
    if (!badge) return;
    try {
        const resp = await apiFetch('/api/notifications/unread_count');
        const data = await resp.json();
        const count = Number(data.count || 0);
        if (count > 0) {
            badge.textContent = String(count);
            badge.classList.remove('hidden');
        } else {
            badge.textContent = '';
            badge.classList.add('hidden');
        }
    } catch (e) {
    }
}


function _getNotificationsListEl() {
    if (currentRole === 'student') return document.getElementById('studentNotificationsList');
    if (currentRole === 'cook') return document.getElementById('cookNotificationsList');
    if (currentRole === 'admin') return document.getElementById('adminNotificationsList');
    return null;
}


function _renderNotifications(listEl, items) {
    if (!listEl) return;

    if (!Array.isArray(items) || items.length === 0) {
        listEl.innerHTML = `<p style="color: var(--text-light); font-size: 12px;">Уведомлений пока нет.</p>`;
        return;
    }

    listEl.innerHTML = items.map(n => {
        const created = n.created_at ? new Date(n.created_at) : null;
        const dt = created && !Number.isNaN(created.getTime()) ? created.toLocaleString() : '';
        const msg = escapeHtml(n.message || '').replace(/\n/g, '<br>');
        return `
            <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                <div class="notif-header">
                    <div class="notif-title">
                        ${escapeHtml(n.title || 'Уведомление')}
                        ${n.is_read ? '' : '<span class="badge badge-warning" style="margin-left: 8px;">Новое</span>'}
                    </div>
                    <div class="notif-meta">${escapeHtml(dt)}</div>
                </div>
                <div class="notif-message">${msg}</div>
                ${n.is_read
                    ? '<span class="badge badge-success">Прочитано</span>'
                    : `<button class="btn btn-secondary btn-small" type="button" onclick="markNotificationRead(${n.id})">Отметить прочитанным</button>`
                }
            </div>
        `;
    }).join('');
}


async function loadNotifications() {
    const listEl = _getNotificationsListEl();
    if (!listEl) return;
    listEl.innerHTML = `<p style="color: var(--text-light); font-size: 12px;">Загрузка...</p>`;
    try {
        const resp = await apiFetch('/api/notifications?limit=100');
        const items = await resp.json();
        _renderNotifications(listEl, items);
        refreshNotificationBadge();
    } catch (e) {
        listEl.innerHTML = `<p style="color: var(--danger); font-size: 12px;">Не удалось загрузить уведомления.</p>`;
    }
}


async function markNotificationRead(notificationId) {
    try {
        const resp = await apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
            method: 'POST'
        });
        const data = await resp.json();
        if (resp.ok) {
            await loadNotifications();
        } else {
            showNotification(data.error || 'Не удалось отметить уведомление', 'error');
        }
    } catch (e) {
        showNotification('Ошибка подключения', 'error');
    }
}


async function handleAdminNotificationSubmit(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target));
    try {
        const resp = await apiFetch('/api/notifications', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (resp.ok) {
            showNotification('Уведомление отправлено', 'success');
            e.target.reset();
        loadIssueMenuOptions();
            loadNotifications();
        } else {
            showNotification(data.error || 'Ошибка', 'error');
        }
    } catch (err) {
        showNotification('Ошибка подключения', 'error');
    }
}

async function loadAdminPricing() {
    const bEl = document.getElementById('subPriceBreakfast');
    const lEl = document.getElementById('subPriceLunch');
    const bothEl = document.getElementById('subPriceBoth');
    const statusEl = document.getElementById('adminPricingStatus');
    if (!bEl || !lEl || !bothEl) return;

    if (statusEl) statusEl.textContent = 'Загрузка...';
    try {
        await loadPricing(true);
        const p = subscriptionPricing || {};

        const b = Number(p.breakfast);
        const l = Number(p.lunch);
        const both = Number(p.both);

        if (Number.isFinite(b)) bEl.value = String(round2(b));
        if (Number.isFinite(l)) lEl.value = String(round2(l));
        if (Number.isFinite(both)) bothEl.value = String(round2(both));

        if (statusEl) statusEl.textContent = '';
    } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = 'Не удалось загрузить тарифы';
    }
}

async function handleAdminPricingSubmit(e) {
    e.preventDefault();
    const bEl = document.getElementById('subPriceBreakfast');
    const lEl = document.getElementById('subPriceLunch');
    const bothEl = document.getElementById('subPriceBoth');
    const statusEl = document.getElementById('adminPricingStatus');

    if (!bEl || !lEl || !bothEl) return;

    const b = parseFloat(bEl.value);
    const l = parseFloat(lEl.value);
    const both = parseFloat(bothEl.value);

    if (![b, l, both].every(v => Number.isFinite(v) && v >= 0)) {
        showNotification('Введите корректные тарифы (неотрицательные числа)', 'error');
        return;
    }

    if (statusEl) statusEl.textContent = 'Сохранение...';

    try {
        const resp = await apiFetch('/api/pricing', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({breakfast: b, lunch: l, both: both})
        });
        const data = await resp.json();
        if (resp.ok) {
            showNotification('Тарифы сохранены', 'success');
            if (statusEl) statusEl.textContent = 'Сохранено';
            await loadPricing(true);
            updateSubscriptionPriceUI();
        } else {
            showNotification(data.error || 'Ошибка', 'error');
            if (statusEl) statusEl.textContent = data.error || 'Ошибка';
        }
    } catch (e2) {
        console.error(e2);
        showNotification('Ошибка подключения', 'error');
        if (statusEl) statusEl.textContent = 'Ошибка подключения';
    }
}


function hideIssueStudentSuggestions() {
    const box = document.getElementById('issueStudentSuggestions');
    if (!box) return;
    box.innerHTML = '';
    box.classList.add('hidden');
    _issueStudentSuggestionsCache = [];
}


function selectIssueStudent(item) {
    const input = document.getElementById('issueStudentFullName');
    const hidden = document.getElementById('issueStudentId');
    const hint = document.getElementById('issueStudentHint');

    if (!input || !hidden || !item) return;

    input.value = item.full_name || '';
    hidden.value = item.id != null ? String(item.id) : '';

    if (hint) {
        const meta = [];
        if (item.school) meta.push(item.school);
        if (item.class_name) meta.push(`класс ${item.class_name}`);
        hint.textContent = meta.length ? `Выбрано: ${item.full_name} (${meta.join(', ')})` : `Выбрано: ${item.full_name}`;
    }

    hideIssueStudentSuggestions();
}


function renderIssueStudentSuggestions(items) {
    const box = document.getElementById('issueStudentSuggestions');
    if (!box) return;

    if (!Array.isArray(items) || items.length === 0) {
        hideIssueStudentSuggestions();
        return;
    }

    _issueStudentSuggestionsCache = items.slice(0, 25);

    box.innerHTML = _issueStudentSuggestionsCache.map((s, idx) => {
        const metaParts = [];
        if (s.school) metaParts.push(s.school);
        if (s.class_name) metaParts.push(`класс ${s.class_name}`);
        if (s.username) metaParts.push(`логин: ${s.username}`);
        const meta = metaParts.join(' • ');

        return `
            <div class="suggestion-item" data-idx="${idx}">
                <div class="suggestion-title">${escapeHtml(s.full_name || '')}</div>
                <div class="suggestion-meta">${escapeHtml(meta)}</div>
            </div>
        `;
    }).join('');

    box.classList.remove('hidden');

    box.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.getAttribute('data-idx') || '-1', 10);
            const item = _issueStudentSuggestionsCache[idx];
            if (item) selectIssueStudent(item);
        });
    });
}


function initIssueStudentAutocomplete() {
    const input = document.getElementById('issueStudentFullName');
    const hidden = document.getElementById('issueStudentId');
    const hint = document.getElementById('issueStudentHint');
    if (!input || !hidden) return;
    if (input.dataset.bound === '1') return;
    input.dataset.bound = '1';

    let timer = null;

    input.addEventListener('input', () => {
        hidden.value = '';
        if (hint) hint.textContent = '';

        const q = (input.value || '').trim();
        if (q.length < 2) {
            hideIssueStudentSuggestions();
            return;
        }

        clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                const resp = await apiFetch(`/api/students/search?query=${encodeURIComponent(q)}`);
                const items = await resp.json();
                renderIssueStudentSuggestions(items);
            } catch (e) {
                hideIssueStudentSuggestions();
            }
        }, 200);
    });

    document.addEventListener('click', (e) => {
        const box = document.getElementById('issueStudentSuggestions');
        if (!box) return;
        if (e.target === input || box.contains(e.target)) return;
        hideIssueStudentSuggestions();
    });
}

async function handleIssueMealSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData);

    const response = await apiFetch('/api/issue_meal', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
        showNotification('Питание выдано', 'success');
        loadMealStats();
        loadProducts();
        if (typeof loadCookMealHistory === 'function') {
            loadCookMealHistory();
        }
        e.target.reset();
        loadIssueMenuOptions();
        hideIssueStudentSuggestions();
        const hint = document.getElementById('issueStudentHint');
        if (hint) hint.textContent = '';
    } else {
        if (response.status === 409 && data && Array.isArray(data.matches)) {
            renderIssueStudentSuggestions(data.matches);
        }
        showNotification(data.error || 'Ошибка', 'error');
    }
}

function showAdminSection(section, el) {
    document.querySelectorAll('#adminDashboard .nav-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');

    document.querySelectorAll('#adminDashboard > div[id$="Section"]').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(`admin${capitalize(section)}Section`);
    if (target) target.classList.remove('hidden');

    if (section === 'stats') loadAdminStats();
    if (section === 'requests') loadAdminRequests();
    if (section === 'report') loadReport();
    if (section === 'pricing') loadAdminPricing();
    if (section === 'notifications') loadNotifications();
}

async function loadAdminStats() {
    const response = await apiFetch('/api/statistics');
    const stats = await response.json();

    const revenueEl = document.getElementById('totalRevenue');
    const mealsEl = document.getElementById('totalMeals');
    const activeEl = document.getElementById('activeStudents');

    if (revenueEl) revenueEl.textContent = `${(stats.payments && stats.payments.total) ? stats.payments.total : 0} ₽`;
    if (mealsEl) mealsEl.textContent = (stats.visits || []).reduce((sum, v) => sum + (v.count || 0), 0);
    if (activeEl) activeEl.textContent = stats.active_students || 0;
}

async function loadAdminRequests() {
    const response = await apiFetch('/api/purchase_requests');
    const requests = await response.json();

    const table = document.getElementById('adminRequestsTable');
    if (!table) return;

    table.innerHTML = `
        <thead>
            <tr>
                <th>Продукт</th>
                <th>Количество</th>
                <th>Стоимость</th>
                <th>Заявитель</th>
                <th>Дата</th>
                <th>Статус</th>
                <th>Действия</th>
            </tr>
        </thead>
        <tbody>
            ${requests.map(r => `
                <tr>
                    <td>${escapeHtml(r.product_name)}</td>
                    <td>${formatQty(r.quantity)} ${escapeHtml(r.unit)}</td>
                    <td>${r.estimated_cost ? `${r.estimated_cost} ₽` : '-'}</td>
                    <td>${escapeHtml(r.requested_by_name || 'N/A')}</td>
                    <td>${new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                        ${r.status === 'pending' ? '<span class="badge badge-warning">Ожидает</span>' :
                            r.status === 'approved' ? '<span class="badge badge-success">Одобрено</span>' :
                            '<span class="badge badge-danger">Отклонено</span>'}
                    </td>
                    <td>
                        ${r.status === 'pending' ? `
                            <button class="btn btn-success" onclick="reviewRequest(${r.id}, 'approved')" style="padding: 6px 12px; font-size: 12px;">Одобрить</button>
                            <button class="btn btn-danger" onclick="reviewRequest(${r.id}, 'rejected')" style="padding: 6px 12px; font-size: 12px;">Отклонить</button>
                        ` : '-'}
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
}

async function reviewRequest(id, status) {
    const response = await apiFetch(`/api/purchase_request/${id}/review`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({status})
    });

    if (response.ok) {
        showNotification('Заявка обработана', 'success');
        loadAdminRequests();
    } else {
        const err = await response.json();
        showNotification(err.error || 'Ошибка', 'error');
    }
}

function syncReportPeriodUI() {
    const select = document.getElementById('reportPeriodSelect');
    const customGroup = document.getElementById('reportCustomDaysGroup');

    if (!select || !customGroup) return;

    if (select.value === 'custom') {
        customGroup.style.display = 'block';
    } else {
        customGroup.style.display = 'none';
        const customInput = document.getElementById('reportCustomDaysInput');
        if (customInput) customInput.value = select.value;
    }
}

function onReportPeriodChange() {
    syncReportPeriodUI();
    const select = document.getElementById('reportPeriodSelect');
    if (select && select.value !== 'custom') {
        loadReport();
    }
}

function getReportDays() {
    const select = document.getElementById('reportPeriodSelect');
    let raw = 30;

    if (select) {
        if (select.value === 'custom') {
            const input = document.getElementById('reportCustomDaysInput');
            raw = input ? parseInt(input.value, 10) : 30;
        } else {
            raw = parseInt(select.value, 10);
        }
    } else {
        const input = document.getElementById('reportDaysInput');
        raw = input ? parseInt(input.value, 10) : 30;
    }

    if (!Number.isFinite(raw) || raw <= 0) return 30;
    return Math.min(Math.max(raw, 1), 365);
}

function downloadReport(format = 'pdf') {
    const days = getReportDays();
    const url = `/api/report/download?format=${encodeURIComponent(format)}&days=${encodeURIComponent(days)}`;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function loadReport() {
    const days = getReportDays();
    const response = await apiFetch(`/api/report?days=${encodeURIComponent(days)}`);
    const report = await response.json();

    const reportEl = document.getElementById('reportContent');
    if (!reportEl) return;

    reportEl.innerHTML = `
        <div class="grid">
            <div class="stat-card">
                <div class="stat-value">${report.total_revenue} ₽</div>
                <div class="stat-label">Выручка (последние ${days} дн.)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.total_costs} ₽</div>
                <div class="stat-label">Затраты на закупки (одобренные)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.profit} ₽</div>
                <div class="stat-label">Прибыль (выручка − затраты)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.total_meals}</div>
                <div class="stat-label">Выдано питаний (последние ${days} дн.)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.active_students}</div>
                <div class="stat-label">Активных учеников (последние ${days} дн.)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.pending_requests}</div>
                <div class="stat-label">Заявок на рассмотрении</div>
            </div>
        </div>
    `;
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeAllergen(value) {
    return (value || '').toString().trim().toLowerCase();
}

function parseAllergens(allergensText) {
    if (!allergensText) return [];
    return String(allergensText)
        .split(/[,;/|]/g)
        .map(a => normalizeAllergen(a))
        .filter(Boolean);
}

function formatQty(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return value === null || value === undefined ? '' : String(value);

    const rounded = Math.round(num * 10) / 10;
    const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9;
    return isInt ? String(Math.round(rounded)) : rounded.toFixed(1);
}

let userCards = [];

function _getUserCardsStorageKey() {
    return currentUserId ? `userCards_${currentUserId}` : 'userCards';
}

function _getSelectedPaymentCardStorageKey() {
    return currentUserId ? `selectedPaymentCard_${currentUserId}` : 'selectedPaymentCard';
}

function _getSelectedPaymentCardId() {
    try {
        const key = _getSelectedPaymentCardStorageKey();
        const val = (typeof _safeLocalStorageGet === 'function')
            ? _safeLocalStorageGet(key)
            : (window.localStorage ? window.localStorage.getItem(key) : null);
        return val ? String(val) : '';
    } catch (e) {
        return '';
    }
}

function _setSelectedPaymentCardId(cardId) {
    try {
        const key = _getSelectedPaymentCardStorageKey();
        const v = String(cardId || '');
        if (typeof _safeLocalStorageSet === 'function') {
            _safeLocalStorageSet(key, v);
        } else {
            if (window.localStorage) window.localStorage.setItem(key, v);
        }
    } catch (e) {
    }
}

let todayMealClaims = [];

const NAVIGATION_CONFIG = {
    student: [
        { id: 'menu', icon: 'menu', text: 'Меню', section: 'Menu' },
        { id: 'payment', icon: 'card', text: 'Оплата', section: 'Payment' },
        { id: 'claim', icon: 'meal', text: 'Получить питание', section: 'Claim' },
        { id: 'allergies', icon: 'warning', text: 'Аллергены', section: 'Allergies' },
        { id: 'reviews', icon: 'star', text: 'Отзывы', section: 'Reviews' },
        { id: 'notifications', icon: 'bell', text: 'Уведомления', section: 'Notifications', badge: 'studentNotifBadge' }
    ],
    cook: [
        { id: 'stats', icon: 'stats', text: 'Статистика', section: 'Stats' },
        { id: 'issue', icon: 'issue', text: 'Выдача', section: 'Issue' },
        { id: 'history', icon: 'report', text: 'История', section: 'History' },
        { id: 'dishes', icon: 'dishes', text: 'Блюда', section: 'Dishes' },
        { id: 'products', icon: 'products', text: 'Продукты', section: 'Products' },
        { id: 'requests', icon: 'requests', text: 'Заявки', section: 'Requests' },
        { id: 'notifications', icon: 'bell', text: 'Уведомления', section: 'Notifications', badge: 'cookNotifBadge' }
    ],
    admin: [
        { id: 'stats', icon: 'stats', text: 'Статистика', section: 'Stats' },
        { id: 'requests', icon: 'requests', text: 'Заявки', section: 'Requests' },
        { id: 'report', icon: 'report', text: 'Отчеты', section: 'Report' },
        { id: 'pricing', icon: 'pricing', text: 'Цены', section: 'Pricing' },
        { id: 'notifications', icon: 'bell', text: 'Уведомления', section: 'Notifications', badge: 'adminNotifBadge' }
    ]
};

function initSidebar(role) {
    const sidebarNav = document.getElementById('sidebarNav');
    if (!sidebarNav) return;

    const navItems = NAVIGATION_CONFIG[role] || [];
    let html = '';

    navItems.forEach((item, index) => {
        const activeClass = index === 0 ? 'active' : '';
        const badgeHtml = item.badge ? `<span class="badge badge-warning sidebar-badge hidden" id="${item.badge}"></span>` : '';
        
        html += `
            <div class="sidebar-item ${activeClass}" data-section="${item.id}" onclick="navigateToSection('${role}', '${item.id}', this)">
                <div class="sidebar-icon">${iconImg(item.icon, 'sidebar-icon-img')}</div>
                <div class="sidebar-text">${item.text}</div>
                ${badgeHtml}
            </div>
        `;
    });

    sidebarNav.innerHTML = html;
}

function navigateToSection(role, sectionId, element) {
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }

    const dashboard = document.getElementById(`${role}Dashboard`);
    if (dashboard) {
        dashboard.querySelectorAll('[id$="Section"]').forEach(section => {
            section.classList.add('hidden');
        });
    }

    const targetSection = document.getElementById(`${role}${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    const headerTitle = document.getElementById('headerTitle');
    const navItem = NAVIGATION_CONFIG[role]?.find(item => item.id === sectionId);
    if (headerTitle && navItem) {
        headerTitle.textContent = navItem.text;
    }

    loadSectionData(role, sectionId);
}

function loadSectionData(role, sectionId) {
    if (role === 'student') {
        switch(sectionId) {
            case 'menu':
                loadMenu(currentMealCategory);
                loadMenuCalendar();
                break;
            case 'payment':
                loadBalanceAndSubscriptions();
                loadUserCards();
                break;
            case 'claim':
                loadClaimMenuOptions();
                loadTodayMealClaims();
                break;
            case 'allergies':
                refreshMyAllergens();
                loadAllergies();
                loadPreferences();
                break;
            case 'reviews':
                loadMenuForReview();
                loadReviews();
                break;
            case 'notifications':
                loadNotifications();
                break;
        }
    } else if (role === 'cook') {
        switch(sectionId) {
            case 'stats':
                loadMealStats();
                break;
            case 'dishes':
                if (typeof initDishCreateForm === 'function') {
                    initDishCreateForm();
                }
                if (typeof loadDishControl === 'function') {
                    loadDishControl();
                }
                break;
            case 'products':
                loadProducts();
                break;
            case 'requests':
                loadCookRequests();
                loadProductsForPurchaseRequestForm();
                break;
            case 'issue':
                loadIssueMenuOptions();
                break;
            case 'history':
                loadCookMealHistory();
                break;
            case 'notifications':
                loadNotifications();
                break;
        }
    } else if (role === 'admin') {
        switch(sectionId) {
            case 'stats':
                loadAdminStats();
                if (typeof loadAttendanceStats === 'function') {
                    loadAttendanceStats();
                }
                break;
            case 'requests':
                loadAdminRequests();
                break;
            case 'report':
                loadReport();
                break;
            case 'pricing':
                loadAdminPricing();
                break;
            case 'notifications':
                loadNotifications();
                break;
        }
    }
}

function iconUrl(name) {
    return `/static/img/icons/${name}.svg`;
}

function iconImg(name, cls = 'ui-icon', alt = '') {
    if (!name) return '';
    const safeAlt = alt ? escapeHtml(alt) : '';
    return `<img class="${cls}" src="${iconUrl(name)}" alt="${safeAlt}">`;
}

function _genCardId() {
    try {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {

    }
    return 'card_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

async function _hashString(value) {
    const str = String(value ?? '');
    try {
        if (window.crypto && crypto.subtle && window.TextEncoder) {
            const data = new TextEncoder().encode(str);
            const digest = await crypto.subtle.digest('SHA-256', data);
            const bytes = Array.from(new Uint8Array(digest));
            return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch (e) {
        
    }

    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
}

function _bytesToBase64(bytes) {
    try {
        const arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
        let bin = '';
        for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
        return btoa(bin);
    } catch (e) {
        return '';
    }
}

function _base64ToBytes(b64) {
    try {
        const bin = atob(String(b64 || ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    } catch (e) {
        return null;
    }
}

async function _deriveAesKeyFromCvv(cvvDigits, saltBytes) {
    try {
        if (!(window.crypto && crypto.subtle && window.TextEncoder)) return null;

        const material = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(String(cvvDigits || '')),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 100000,
                hash: 'SHA-256'
            },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    } catch (e) {
        return null;
    }
}

async function _encryptCardPayload(payloadStr, cvvDigits) {
    try {
        if (!(window.crypto && crypto.subtle && window.TextEncoder && window.TextDecoder)) return null;

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await _deriveAesKeyFromCvv(cvvDigits, salt);
        if (!key) return null;

        const data = new TextEncoder().encode(String(payloadStr || ''));
        const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        const cipherBytes = new Uint8Array(cipherBuf);

        return {
            enc: _bytesToBase64(cipherBytes),
            iv: _bytesToBase64(iv),
            salt: _bytesToBase64(salt)
        };
    } catch (e) {
        return null;
    }
}

async function _decryptCardPayload(encB64, ivB64, saltB64, cvvDigits) {
    try {
        if (!(window.crypto && crypto.subtle && window.TextEncoder && window.TextDecoder)) return null;

        const iv = _base64ToBytes(ivB64);
        const salt = _base64ToBytes(saltB64);
        const cipher = _base64ToBytes(encB64);

        if (!iv || !salt || !cipher) return null;

        const key = await _deriveAesKeyFromCvv(cvvDigits, salt);
        if (!key) return null;

        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
        return new TextDecoder().decode(plainBuf);
    } catch (e) {
        return null;
    }
}


function _normalizeCardNumberDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 16);
}

function _formatCardNumberFromDigits(digits) {
    return (String(digits || '').match(/.{1,4}/g) || []).join(' ');
}

function _normalizeHolder(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function _normalizeExpiryDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function _formatExpiryFromDigits(digits) {
    const d = String(digits || '');
    if (d.length < 4) return '';
    return d.slice(0, 2) + '/' + d.slice(2);
}

let _pendingRevealCardIndex = null;

function openRevealCardModal(index) {
    _pendingRevealCardIndex = index;

    const modal = document.getElementById('revealCardModal');
    const form = document.getElementById('revealCardForm');
    const hint = document.getElementById('revealCardHint');

    if (form) form.reset();

    const card = userCards?.[index];
    const last4 = card?.last4 ? String(card.last4) : '';
    if (hint) {
        hint.textContent = last4 ? `Подсказка: карта заканчивается на ${last4}` : '';
    }

    if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    }

    const cvvInput = document.getElementById('revealCardCvvInput');
    if (cvvInput) cvvInput.focus();
}

function closeRevealCardModal() {
    _pendingRevealCardIndex = null;
    const modal = document.getElementById('revealCardModal');
    const form = document.getElementById('revealCardForm');
    const hint = document.getElementById('revealCardHint');
    if (form) form.reset();
    if (hint) hint.textContent = '';
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
}

async function loadUserCards() {
    const key = _getUserCardsStorageKey();
    let saved = (typeof _safeLocalStorageGet === 'function')
        ? _safeLocalStorageGet(key)
        : (window.localStorage ? window.localStorage.getItem(key) : null);

    if (!saved && currentUserId) {
        const legacy = (typeof _safeLocalStorageGet === 'function')
            ? _safeLocalStorageGet('userCards')
            : (window.localStorage ? window.localStorage.getItem('userCards') : null);
        if (legacy) saved = legacy;
    }

    let parsed = [];
    if (saved) {
        try {
            parsed = JSON.parse(saved);
        } catch (e) {
            parsed = [];
        }
    }

    userCards = await _migrateCardsToHashed(parsed);

    saveUserCards();
    renderCards();
    syncPaymentCardRequirementUI();
}


async function _migrateCardsToHashed(list) {
    const arr = Array.isArray(list) ? list : [];
    const out = [];
    const seen = new Set();

    for (const c of arr) {
        if (!c) continue;

        const id = String(c.id || '').trim() || _genCardId();

        let last4 = String(c.last4 || '').replace(/\D/g, '').slice(-4);
        if (last4.length !== 4) {
            const digits = _normalizeCardNumberDigits(c.number || '');
            if (digits.length >= 4) last4 = digits.slice(-4);
        }

        if (last4.length !== 4) continue;

        const brand = String(c.brand || c.card_brand || '').trim() || 'Банковская карта';

        if (seen.has(id)) continue;
        seen.add(id);

        out.push({
            id,
            last4,
            brand,
            created_at: c.created_at || Date.now()
        });
    }

    return out;
}


function saveUserCards() {
    const key = _getUserCardsStorageKey();
    const safe = Array.isArray(userCards) ? userCards
        .map(c => ({
            id: String(c?.id || '').trim() || _genCardId(),
            last4: String(c?.last4 || '').replace(/\D/g, '').slice(-4),
            brand: String(c?.brand || 'Банковская карта'),
            created_at: c?.created_at || Date.now()
        }))
        .filter(c => c.last4 && c.last4.length === 4)
        : [];

    if (typeof _safeLocalStorageSet === 'function') {
        _safeLocalStorageSet(key, JSON.stringify(safe));
    } else {
        try {
            if (window.localStorage) window.localStorage.setItem(key, JSON.stringify(safe));
        } catch (e) {
            
        }
    }

    
    if (key !== 'userCards') {
        try {
            if (window.localStorage) window.localStorage.removeItem('userCards');
        } catch (e) {
            
        }
    }

    syncPaymentCardRequirementUI();
}


function renderCards() {
    const cardsList = document.getElementById('cardsList');
    if (!cardsList) return;

    if (!Array.isArray(userCards) || userCards.length === 0) {
        cardsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Нет добавленных карт</p>';
        return;
    }

    let html = '';
    userCards.forEach((card, index) => {
        const last4 = String(card?.last4 || '').replace(/\D/g, '').slice(-4) || '••••';
        const brand = escapeHtml(String(card?.brand || 'Банковская карта'));

        html += `
            <div class="virtual-card">
                <div class="card-header">
                    <div class="card-logo">${brand}</div>
                    <div class="card-actions">
                        <button class="btn btn-danger btn-icon btn-small" onclick="deleteCard(${index})" title="Удалить">
                            ${iconImg('trash', 'btn-icon-img')}
                        </button>
                    </div>
                </div>
                <div class="card-number">•••• •••• •••• ${escapeHtml(last4)}</div>
                <div class="card-details">
                    <div class="card-holder">
                        <div class="card-holder-label">Владелец</div>
                        <div class="card-holder-name" style="color: var(--text-muted);">Не хранится</div>
                    </div>
                    <div class="card-expiry">
                        <div class="card-expiry-label">Действует до</div>
                        <div class="card-expiry-date" style="color: var(--text-muted);">Не хранится</div>
                    </div>
                </div>
            </div>
        `;
    });

    cardsList.innerHTML = html;
}


function updatePaymentCardSelectUI() {
    const group = document.getElementById('paymentCardSelectGroup');
    const select = document.getElementById('paymentCardSelect');
    const hint = document.getElementById('paymentCardSelectHint');

    if (!group || !select) return;

    const cards = Array.isArray(userCards) ? userCards : [];
    const hasCards = cards.length > 0;

    if (!hasCards) {
        group.classList.add('hidden');
        select.innerHTML = '';
        select.value = '';
        select.disabled = true;
        if (hint) hint.textContent = '';
        return;
    }

    if (select.dataset.bound !== '1') {
        select.dataset.bound = '1';
        select.addEventListener('change', () => {
            _setSelectedPaymentCardId(select.value || '');
        });
    }

    const optionsHtml = cards.map(c => {
        const id = escapeHtml(c.id || '');
        const last4 = String(c.last4 || '').slice(-4) || '••••';
        return `<option value="${id}">•••• •••• •••• ${escapeHtml(last4)}</option>`;
    }).join('');

    select.innerHTML = optionsHtml;
    select.disabled = false;

    if (cards.length > 1) {
        group.classList.remove('hidden');
        if (hint) hint.textContent = 'Выберите карту, с которой будет выполнена оплата.';
    } else {
        group.classList.add('hidden');
        if (hint) hint.textContent = '';
    }

    const savedId = _getSelectedPaymentCardId();
    const fallbackId = cards[0]?.id ? String(cards[0].id) : '';
    const selectedId = (savedId && cards.some(c => String(c.id) === String(savedId))) ? String(savedId) : fallbackId;
    if (selectedId) {
        select.value = selectedId;
        _setSelectedPaymentCardId(selectedId);
    }
}

function syncPaymentCardRequirementUI() {
    const hintEl = document.getElementById('paymentCardRequiredHint');
    const payBtn = document.querySelector('#paymentForm button[type="submit"]');

    const hasCards = Array.isArray(userCards) && userCards.length > 0;

    if (payBtn) payBtn.disabled = !hasCards;

    if (hintEl) {
        hintEl.textContent = hasCards
            ? ''
            : 'Чтобы пополнить баланс или оплатить абонемент, сначала добавьте карту в разделе «Мои карты».';
    }

    if (typeof updatePaymentCardSelectUI === 'function') {
        updatePaymentCardSelectUI();
    }
}

function showAddCardForm() {
    const section = document.getElementById('addCardSection');
    if (section) {
        section.classList.remove('hidden');
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function hideAddCardForm() {
    const section = document.getElementById('addCardSection');
    const form = document.getElementById('addCardForm');
    if (section) section.classList.add('hidden');
    if (form) form.reset();
}

function formatCardNumber(input) {
    if (!input) return;
    const raw = String(input.value || '');
    const caret = input.selectionStart ?? raw.length;

    const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
    const digits = raw.replace(/\D/g, '').slice(0, 16);
    const groups = digits.match(/.{1,4}/g) || [];
    const formatted = groups.join(' ');
    input.value = formatted;

    const spacesBefore = digitsBefore > 0 ? Math.floor((digitsBefore - 1) / 4) : 0;
    const newPos = Math.min(formatted.length, digitsBefore + spacesBefore);
    try { input.setSelectionRange(newPos, newPos); } catch (e) {}
}

function formatCardExpiry(input) {
    if (!input) return;
    const raw = String(input.value || '');
    const caret = input.selectionStart ?? raw.length;

    const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
    const digits = raw.replace(/\D/g, '').slice(0, 4);

    let formatted = digits;
    if (digits.length > 2) {
        formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    }
    input.value = formatted;

    const addSlash = digitsBefore > 2 ? 1 : 0;
    const newPos = Math.min(formatted.length, digitsBefore + addSlash);
    try { input.setSelectionRange(newPos, newPos); } catch (e) {}
}

async function _handleRevealCardSubmit() {
    const index = _pendingRevealCardIndex;
    const card = (Array.isArray(userCards) ? userCards[index] : null);

    if (index === null || index === undefined || !card) {
        closeRevealCardModal();
        return;
    }

    const cvvInput = document.getElementById('revealCardCvvInput');
    if (!cvvInput) return;

    const cvvDigits = String(cvvInput.value || '').replace(/\D/g, '').slice(0, 3);
    if (cvvDigits.length !== 3) {
        showNotification('CVV должен состоять из 3 цифр', 'error');
        cvvInput.focus();
        return;
    }

    if (!card.cvv_hash) {
        showNotification('Эта карта добавлена в старой версии. Удалите её и добавьте заново, чтобы включить просмотр по CVV.', 'error');
        return;
    }

    const cvvHash = await _hashString(`cvv:${cvvDigits}`);
    if (String(card.cvv_hash || '') !== String(cvvHash)) {
        showNotification('Неверный CVV', 'error');
        cvvInput.focus();
        return;
    }

    let payloadStr = null;

    if (card.enc && card.enc_iv && card.enc_salt) {
        payloadStr = await _decryptCardPayload(card.enc, card.enc_iv, card.enc_salt, cvvDigits);
        if (!payloadStr) {
            showNotification('Не удалось показать данные карты (проверьте CVV)', 'error');
            cvvInput.focus();
            return;
        }
    } else if (card._reveal) {
        payloadStr = JSON.stringify(card._reveal);
    } else {
        showNotification('Не удалось показать данные карты. Удалите карту и добавьте заново.', 'error');
        return;
    }

    let payload;
    try {
        payload = JSON.parse(payloadStr);
    } catch (e) {
        showNotification('Ошибка данных карты', 'error');
        return;
    }

    const number = String(payload.number || '');
    const holder = String(payload.holder || '');
    const expiry = String(payload.expiry || '');

    if (!number || !expiry) {
        showNotification('Ошибка данных карты', 'error');
        return;
    }

    card._reveal = { number, holder, expiry };
    card.hidden = false;

    closeRevealCardModal();
    saveUserCards();
    renderCards();
    showNotification('Данные карты показаны', 'success');
}

function initCardFormHandlers() {
    const cardNumberInput = document.getElementById('cardNumberInput');
    const cardExpiryInput = document.getElementById('cardExpiryInput');
    const cardCvvInput = document.getElementById('cardCvvInput');
    const addCardForm = document.getElementById('addCardForm');

    if (cardNumberInput && cardNumberInput.dataset.bound !== '1') {
        cardNumberInput.dataset.bound = '1';
        cardNumberInput.addEventListener('input', (e) => {
            formatCardNumber(e.target);
        });
    }

    if (cardExpiryInput && cardExpiryInput.dataset.bound !== '1') {
        cardExpiryInput.dataset.bound = '1';
        cardExpiryInput.addEventListener('input', (e) => {
            formatCardExpiry(e.target);
        });
    }

    if (cardCvvInput && cardCvvInput.dataset.bound !== '1') {
        cardCvvInput.dataset.bound = '1';
        cardCvvInput.addEventListener('input', (e) => {
            const raw = String(e.target.value || '');
            e.target.value = raw.replace(/\D/g, '').slice(0, 3);
        });
    }

    if (addCardForm && addCardForm.dataset.bound !== '1') {
        addCardForm.dataset.bound = '1';
        addCardForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addNewCard();
        });
    }

    const revealCvv = document.getElementById('revealCardCvvInput');
    const revealForm = document.getElementById('revealCardForm');

    if (revealCvv && revealCvv.dataset.bound !== '1') {
        revealCvv.dataset.bound = '1';
        revealCvv.addEventListener('input', (e) => {
            const raw = String(e.target.value || '');
            e.target.value = raw.replace(/\D/g, '').slice(0, 3);
        });
    }

    if (revealForm && revealForm.dataset.bound !== '1') {
        revealForm.dataset.bound = '1';
        revealForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _handleRevealCardSubmit();
        });
    }

    const modal = document.getElementById('revealCardModal');
    if (modal && modal.dataset.bound !== '1') {
        modal.dataset.bound = '1';
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeRevealCardModal();
        });
    }
}

async function addNewCard() {
    const numberInput = document.getElementById('cardNumberInput');
    const holderInput = document.getElementById('cardHolderInput');
    const expiryInput = document.getElementById('cardExpiryInput');
    const cvvInput = document.getElementById('cardCvvInput');

    if (!numberInput || !holderInput || !expiryInput || !cvvInput) return;

    const numberDigits = _normalizeCardNumberDigits(numberInput.value);
    if (numberDigits.length !== 16) {
        showNotification('Номер карты должен быть в формате 9999 9999 9999 9999', 'error');
        numberInput.focus();
        return;
    }

    const holder = _normalizeHolder(holderInput.value);
    if (holder.length < 2) {
        showNotification('Укажите имя владельца карты', 'error');
        holderInput.focus();
        return;
    }

    const expDigits = _normalizeExpiryDigits(expiryInput.value);
    if (expDigits.length !== 4) {
        showNotification('Срок действия должен быть в формате 99/99', 'error');
        expiryInput.focus();
        return;
    }

    const mm = parseInt(expDigits.slice(0, 2), 10);
    const yy = parseInt(expDigits.slice(2), 10);
    if (!Number.isFinite(mm) || mm < 1 || mm > 12 || !Number.isFinite(yy)) {
        showNotification('Введите корректный срок действия (например 09/27)', 'error');
        expiryInput.focus();
        return;
    }

    const cvvDigits = String(cvvInput.value || '').replace(/\D/g, '').slice(0, 3);
    if (cvvDigits.length !== 3) {
        showNotification('CVV должен состоять из 3 цифр', 'error');
        cvvInput.focus();
        return;
    }

    const card = {
        id: _genCardId(),                 
        last4: numberDigits.slice(-4),
        brand: 'Банковская карта',
        created_at: Date.now()
    };

    userCards = Array.isArray(userCards) ? userCards : [];
    userCards.push(card);

    try {
        numberInput.value = '';
        holderInput.value = '';
        expiryInput.value = '';
        cvvInput.value = '';
    } catch (e) {
    }

    saveUserCards();
    renderCards();
    hideAddCardForm();

    showNotification('Карта добавлена: сохранён только токен и последние 4 цифры', 'success');
}


function toggleCardVisibility(index) {
    showNotification('Данные карты не сохраняются, поэтому показать номер/владельца/срок невозможно.', 'info');
}


function deleteCard(index) {
    if (confirm('Вы уверены, что хотите удалить эту карту?')) {
        userCards.splice(index, 1);
        saveUserCards();
        renderCards();
        showNotification('Карта удалена', 'success');
    }
}

todayMealClaims = [];

function _mealTypeLabel(mealType) {
    return mealType === 'breakfast' ? 'Завтрак' : 'Обед';
}

function _formatTimeFromTs(ts) {
    if (!ts) return '';
    const m = String(ts).match(/\b(\d{2}:\d{2})\b/);
    return m ? m[1] : String(ts);
}

function _formatDateTimeFromTs(ts) {
    if (!ts) return '';
    const str = String(ts);
    if (str.includes('T')) {
        const d = new Date(str);
        return isNaN(d.getTime()) ? str : d.toLocaleString('ru-RU');
    }
    const parts = str.split(' ');
    if (parts.length >= 2) {
        const time = parts[1].slice(0, 5);
        const date = parts[0].split('-').reverse().join('.');
        return `${date} ${time}`;
    }
    return str;
}

function _getLatestClaim(mealType) {
    return todayMealClaims.find(c => c.meal_type === mealType) || null;
}

function _statusBadge(claim) {
    if (!claim) return '<span class="badge badge-warning">Не выдано</span>';

    if (claim.student_received === 1) return '<span class="badge badge-success">Получено</span>';
    if (claim.student_received === 0) return '<span class="badge badge-danger">Не получено</span>';
    return '<span class="badge badge-warning">Не отмечено</span>';
}

function renderTodayMealStatus() {
    const breakfastInfo = document.getElementById('breakfastClaimInfo');
    const lunchInfo = document.getElementById('lunchClaimInfo');

    const bYes = document.getElementById('breakfastConfirmYesBtn');
    const bNo = document.getElementById('breakfastConfirmNoBtn');
    const lYes = document.getElementById('lunchConfirmYesBtn');
    const lNo = document.getElementById('lunchConfirmNoBtn');

    const b = _getLatestClaim('breakfast');
    const l = _getLatestClaim('lunch');

    const renderInfo = (el, claim) => {
        if (!el) return;
        if (!claim) {
            el.innerHTML = 'Не выдано. Подойдите к повару.';
            return;
        }

        const dish = claim.dish_name ? escapeHtml(claim.dish_name) : '—';
        const issuer = claim.issuer_name ? escapeHtml(claim.issuer_name) : '—';
        const time = _formatTimeFromTs(claim.claimed_at);

        let statusLine = '';
        if (claim.student_received === 1) {
            statusLine = `Статус: <span class="badge badge-success">Получено</span>`;
        } else if (claim.student_received === 0) {
            statusLine = `Статус: <span class="badge badge-danger">Не получено</span>`;
        } else {
            statusLine = `Статус: <span class="badge badge-warning">Ожидает подтверждения</span>`;
        }

        const markedAt = claim.student_marked_at ? _formatDateTimeFromTs(claim.student_marked_at) : null;

        el.innerHTML = `
            Выдано: <b>${dish}</b> (${time})<br>
            Повар: <b>${issuer}</b><br>
            ${statusLine}
            ${markedAt ? `<br><span style="color: var(--text-muted); font-size: 12px;">Отмечено: ${markedAt}</span>` : ''}
        `;
    };

    renderInfo(breakfastInfo, b);
    renderInfo(lunchInfo, l);

    const enable = (btn, can) => { if (btn) btn.disabled = !can; };

    enable(bYes, !!b);
    enable(bNo, !!b);
    enable(lYes, !!l);
    enable(lNo, !!l);

    const summaryEl = document.getElementById('mealClaimSummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <b>Итог:</b>
            Завтрак — ${_statusBadge(b)} ·
            Обед — ${_statusBadge(l)}
        `;
    }
}

async function loadTodayMealClaims() {
    const historyEl = document.getElementById('mealClaimHistory');
    if (!historyEl && !document.getElementById('mealClaimSummary')) return;

    try {
        const resp = await apiFetch('/api/meal-claims/today');
        if (!resp.ok) {
            todayMealClaims = [];
            renderTodayMealStatus();
            renderMealClaimHistory();
            return;
        }

        const data = await resp.json();
        todayMealClaims = Array.isArray(data) ? data : (data.claims || []);

        renderTodayMealStatus();
        renderMealClaimHistory();
    } catch (e) {
        console.error(e);
        todayMealClaims = [];
        renderTodayMealStatus();
        renderMealClaimHistory();
    }
}

function renderMealClaimHistory() {
    const container = document.getElementById('mealClaimHistory');
    if (!container) return;

    if (!todayMealClaims || todayMealClaims.length === 0) {
        container.innerHTML = '<div class="empty-state">Сегодня выдач пока нет</div>';
        return;
    }

    container.innerHTML = todayMealClaims.map(claim => {
        const mealLabel = _mealTypeLabel(claim.meal_type);
        const time = _formatDateTimeFromTs(claim.claimed_at);

        const dish = claim.dish_name ? escapeHtml(claim.dish_name) : '—';
        const issuer = claim.issuer_name ? escapeHtml(claim.issuer_name) : '—';

        let badgeClass = 'badge-warning';
        let badgeText = 'Не отмечено';

        if (claim.student_received === 1) {
            badgeClass = 'badge-success';
            badgeText = 'Получено';
        } else if (claim.student_received === 0) {
            badgeClass = 'badge-danger';
            badgeText = 'Не получено';
        }

        return `
            <div class="meal-claim-item">
                <div class="meal-claim-info">
                    <div class="meal-claim-icon">${iconImg('meal','ui-icon ui-icon-lg')}</div>
                    <div class="meal-claim-details">
                        <div class="meal-claim-type">${mealLabel}</div>
                        <div class="meal-claim-time">${time}</div>
                        <div class="meal-claim-status">Блюдо: <b>${dish}</b> · Повар: <b>${issuer}</b></div>
                    </div>
                </div>
                <div class="meal-claim-badge badge ${badgeClass}">${badgeText}</div>
            </div>
        `;
    }).join('');
}

async function confirmMealReceipt(mealType, received) {
    const claim = _getLatestClaim(mealType);
    if (!claim) {
        showNotification('Сначала питание должен выдать повар', 'error');
        return;
    }

    try {
        const resp = await apiFetch(`/api/meal-claims/${claim.id}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ received })
        });

        if (resp.ok) {
            showNotification('Отметка сохранена', 'success');
            await loadTodayMealClaims();
        } else {
            const err = await resp.json();
            showNotification(err.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

window.confirmMealReceipt = confirmMealReceipt;


function initPaymentFormV2() {
    const paymentForm = document.getElementById('paymentForm');
    if (!paymentForm) return;

    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        try {
            const response = await apiFetch('/api/payment', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showNotification(result.message || 'Оплата прошла успешно', 'success');
                
                await updateHeaderBalance();
                await loadBalanceAndSubscriptions();
                
                e.target.reset();
        loadIssueMenuOptions();
                updateSubscriptionPriceUI();
            } else {
                showNotification(result.error || 'Ошибка оплаты', 'error');
            }
        } catch (error) {
            showNotification('Ошибка подключения', 'error');
        }
    });
}


const originalInitMainPage = window.initMainPage;
if (typeof originalInitMainPage === 'function') {
    window.initMainPage = async function() {
        try {
            const meResp = await apiFetch('/api/me');
            const me = await meResp.json();

            currentRole = me.role;
            currentUserId = me.user_id || null;
            try {
                document.body.dataset.role = me.role || '';
            } catch (e) {
            }
            const userNameEl = document.getElementById('userName');
            if (userNameEl) userNameEl.textContent = me.full_name || me.username || '';

            initSidebar(me.role);

            if (me.role === 'student') {
                document.getElementById('studentDashboard')?.classList.remove('hidden');
                await refreshMyAllergens();
                loadMenu('breakfast');
                loadMenuCalendar();
                loadBalanceAndSubscriptions();
                loadClaimMenuOptions();
                loadPreferences();
                await loadPricing();
                
                loadUserCards();
                loadTodayMealClaims();
            } else if (me.role === 'cook') {
                document.getElementById('cookDashboard')?.classList.remove('hidden');
                loadMealStats();
            } else if (me.role === 'admin') {
                document.getElementById('adminDashboard')?.classList.remove('hidden');
                loadAdminStats();
            }
            
            initMainEventHandlers();
            updateSubscriptionPriceUI();
            refreshNotificationBadge();
            updateHeaderBalance();
        } catch (err) {
            console.error(err);
        }
    };
}

window.initSidebar = initSidebar;
window.navigateToSection = navigateToSection;
window.showAddCardForm = showAddCardForm;
window.hideAddCardForm = hideAddCardForm;
window.toggleCardVisibility = toggleCardVisibility;
window.deleteCard = deleteCard;
window.loadTodayMealClaims = loadTodayMealClaims;
window.loadCookMealHistory = loadCookMealHistory;
window.onCookHistoryPeriodChange = onCookHistoryPeriodChange;

