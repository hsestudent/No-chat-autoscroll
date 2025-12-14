/**
 * Модуль No Chat Autoscroll v1.0
 */

const MODULE_ID = "no-chat-autoscroll";

// Маркер для проверки, что наша функция ChatLog.prototype.scrollBottom активна
const IS_PATCHED_MARKER = Symbol("no-chat-autoscroll-patched");

let originalScrollBottom = null;
let isManualScroll = false; 
let lastKnownScrollState = true; 
const SCROLL_TOLERANCE = 5; // Допуск в 5 пикселей

// --- Утилиты ---

/**
 * Надежно находит прокручиваемый DOM-элемент чата.
 * @returns {HTMLElement|null}
 */
function getChatContainer() {
    const chatApp = ui.chat;
    if (!chatApp || !chatApp.element) return null;
    
    // КРИТИЧНОЕ ИСПРАВЛЕНИЕ: Оборачиваем chatApp.element в jQuery ($) 
    // для обеспечения совместимости с методом .find()
    const $chatAppElement = $(chatApp.element); 
    
    // 1. V13+ Standard: The .chat-scroll div
    const $scrollContainer = $chatAppElement.find(".chat-scroll");
    if ($scrollContainer.length) {
        return $scrollContainer[0];
    }
    
    // 2. Fallback: The #chat-log element itself
    const $logElement = $chatAppElement.find("#chat-log");
    if ($logElement.length) {
        return $logElement[0];
    }
    
    return null;
}

/**
 * Определяет, находится ли прокрутка элемента в пределах допуска от самого низа.
 */
function isScrolledToBottom(container) {
    if (!container) return false;
    
    const difference = container.scrollHeight - (container.scrollTop + container.clientHeight);
    return difference <= SCROLL_TOLERANCE;
}

/**
 * Переопределяет ChatLog.prototype.scrollBottom для реализации умной прокрутки.
 */
function overrideScrollBottom() {
    
    if (typeof ChatLog === 'undefined' || typeof ChatLog.prototype.scrollBottom !== 'function') {
        return;
    }
    
    if (!originalScrollBottom) {
        originalScrollBottom = Object.getOwnPropertyDescriptor(ChatLog.prototype, 'scrollBottom')?.value || ChatLog.prototype.scrollBottom;
        if (!originalScrollBottom) return;
    }

    const newScrollBottom = function(options = {}) {
        
        // Самодиагностика: Если патч слетел, возвращаемся к оригиналу
        if (newScrollBottom[IS_PATCHED_MARKER] !== true) {
             return originalScrollBottom.apply(this, arguments); 
        }

        // 1. Приоритет: Ручная прокрутка (с кнопки)
        if (isManualScroll) {
            isManualScroll = false;
            return originalScrollBottom.apply(this, arguments);
        }

        // 2. Умная прокрутка: Проверяем сохраненное состояние
        if (lastKnownScrollState) {
            // Если чат БЫЛ внизу, разрешаем прокрутку
            return originalScrollBottom.apply(this, arguments);
        }

        // 3. БЛОКИРУЕМ (пользователь читал историю)
        return;
    };
    
    newScrollBottom[IS_PATCHED_MARKER] = true;

    ChatLog.prototype.scrollBottom = newScrollBottom;

    console.log(`${MODULE_ID} | ChatLog.prototype.scrollBottom успешно заменен.`);
}

/**
 * Хук для проверки и сохранения состояния прокрутки ПЕРЕД добавлением сообщения.
 */
Hooks.on('preCreateChatMessage', () => {
    const container = getChatContainer();
    
    // Сохраняем состояние: true, если чат внизу, иначе false.
    lastKnownScrollState = container ? isScrolledToBottom(container) : true;
});


// --- Обработчики Скролла и Кнопки ---

function updateScrollState() {
    const container = getChatContainer();
    if (container) {
        lastKnownScrollState = isScrolledToBottom(container);
    }
}

Hooks.on('renderChatLog', (app, html, data) => {
    const container = getChatContainer();

    if (container) {
        // Добавляем слушатель для отслеживания ручной прокрутки
        container.removeEventListener('scroll', updateScrollState);
        container.addEventListener('scroll', updateScrollState, { passive: true });
        
        lastKnownScrollState = isScrolledToBottom(container);
    }
    attachButtonListener(app, html);
});

function attachButtonListener(app, html) {
    const logElement = (html instanceof HTMLElement) ? html : html[0];
    if (!logElement) return;

    const jumpBtn = logElement.querySelector(".jump-to-bottom");

    if (jumpBtn) {
        if (jumpBtn.getAttribute('data-scroll-blocked')) return;
        jumpBtn.setAttribute('data-scroll-blocked', 'true');

        jumpBtn.addEventListener("click", (ev) => {
            ev.stopPropagation(); 
            ev.preventDefault();  

            isManualScroll = true;
            ui.chat.scrollBottom(); 
        });
    }
}

// Инициализация
Hooks.once('ready', () => {
    console.log(`${MODULE_ID} | Модуль активирован.`);
    setTimeout(overrideScrollBottom, 50); 
});