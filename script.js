const THEMES = {
    dark: 'dark',
    light: 'light',
    neon: 'neon',
    pastel: 'pastel'
};

class HistoryManager {
    constructor() {
        this.history = JSON.parse(localStorage.getItem('calc_history')) || [];
        this.listElement = document.getElementById('history-list');
        this.dotElement = document.getElementById('history-dot');
        this.render();
    }

    add(expression, result) {
        const item = { expression, result, timestamp: new Date().toISOString() };
        this.history.unshift(item); // Add to top
        if (this.history.length > 50) this.history.pop(); // Limit to 50
        this.save();
        this.render();
        this.notify();
    }

    save() {
        localStorage.setItem('calc_history', JSON.stringify(this.history));
    }

    clear() {
        this.history = [];
        this.save();
        this.render();
    }

    notify() {
        if (this.dotElement) {
            this.dotElement.style.display = 'block';
        }
    }

    clearNotification() {
        if (this.dotElement) {
            this.dotElement.style.display = 'none';
        }
    }

    render() {
        if (!this.listElement) return;
        this.listElement.innerHTML = '';

        if (this.history.length === 0) {
            this.listElement.innerHTML = '<li class="empty-state" style="padding:20px; text-align:center; color:#888;">No history yet</li>';
            return;
        }

        this.history.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <div class="history-expression">${item.expression} =</div>
                <div class="history-result">${item.result}</div>
            `;
            li.onclick = () => {
                // Dispatch event to load this into calculator
                document.dispatchEvent(new CustomEvent('loadHistory', { detail: item.result }));
            };
            this.listElement.appendChild(li);
        });
    }

    exportToFile() {
        if (this.history.length === 0) return;

        let content = "Calculator History Export\n=========================\n\n";
        this.history.forEach(h => {
            content += `${h.expression} = ${h.result}\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `calc_history_${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

class UnitConverter {
    constructor() {
        this.rates = {
            length: {
                m: 1, km: 0.001, cm: 100, mm: 1000, inch: 39.3701, ft: 3.28084, yd: 1.09361, mile: 0.000621371
            },
            weight: {
                kg: 1, g: 1000, mg: 1000000, lb: 2.20462, oz: 35.274
            },
            data: {
                B: 1, KB: 0.0009765625, MB: 9.5367431640625e-7, GB: 9.3132257461548e-10, TB: 9.0949470177293e-13
            },
            temperature: 'special',
            currency: {} 
        };

        this.currentType = 'length';
        this.lastCurrencyFetch = 0;
        this.initUI();
    }

    initUI() {
        this.fromVal = document.getElementById('convert-from-val');
        this.toVal = document.getElementById('convert-to-val');
        this.fromUnit = document.getElementById('convert-from-unit');
        this.toUnit = document.getElementById('convert-to-unit');

        this.fromVal.addEventListener('input', () => this.convert());
        this.fromUnit.addEventListener('change', () => this.convert());
        this.toUnit.addEventListener('change', () => this.convert());

        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setType(e.target.dataset.type);
            });
        });

        this.loadCurrencyRates();
        this.setType('length');
    }

    setType(type) {
        this.currentType = type;
        if (type === 'currency') {
            this.fetchCurrencyRates();
        }
        this.populateSelects();
        this.convert();
    }

    populateSelects() {
        this.fromUnit.innerHTML = '';
        this.toUnit.innerHTML = '';

        if (this.currentType === 'temperature') {
            const units = ['Celsius', 'Fahrenheit', 'Kelvin'];
            units.forEach(u => {
                this.fromUnit.add(new Option(u, u));
                this.toUnit.add(new Option(u, u));
            });
        } else if (this.currentType === 'currency' && Object.keys(this.rates.currency).length === 0) {
            this.fromUnit.add(new Option('Loading...', 'USD'));
            this.toUnit.add(new Option('Loading...', 'EUR'));
        } else {
            const units = Object.keys(this.rates[this.currentType]);
            units.forEach(u => {
                this.fromUnit.add(new Option(u, u));
                this.toUnit.add(new Option(u, u));
            });
        }

        if (this.toUnit.options.length > 1) this.toUnit.selectedIndex = 1;
    }

    async fetchCurrencyRates() {
        const now = Date.now();
        if (now - this.lastCurrencyFetch < 3600000 && Object.keys(this.rates.currency).length > 0) {
            return;
        }

        try {
            const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await res.json();

            this.rates.currency = data.rates;
            this.lastCurrencyFetch = now;

            localStorage.setItem('calc_currency_rates', JSON.stringify(data.rates));
            localStorage.setItem('calc_currency_time', now);

            if (this.currentType === 'currency') {
                this.populateSelects();
                this.convert();
            }
        } catch (err) {
            console.error("Currency fetch failed", err);
        }
    }

    loadCurrencyRates() {
        const cached = localStorage.getItem('calc_currency_rates');
        const time = localStorage.getItem('calc_currency_time');

        if (cached) {
            this.rates.currency = JSON.parse(cached);
            this.lastCurrencyFetch = parseInt(time) || 0;
        }
    }

    convert() {
        const val = parseFloat(this.fromVal.value);
        const from = this.fromUnit.value;
        const to = this.toUnit.value;

        if (isNaN(val)) {
            this.toVal.value = '';
            return;
        }

        let result;

        if (this.currentType === 'temperature') {
            result = this.convertTemp(val, from, to);
        } else {
            const base = val / this.rates[this.currentType][from]; 
            result = base * this.rates[this.currentType][to];   
        }

        this.toVal.value = Number.isInteger(result) ? result : result.toFixed(4).replace(/\.?0+$/, '');
    }

    convertTemp(val, from, to) {
        let celsius;
        if (from === 'Celsius') celsius = val;
        else if (from === 'Fahrenheit') celsius = (val - 32) * 5 / 9;
        else if (from === 'Kelvin') celsius = val - 273.15;

        if (to === 'Celsius') return celsius;
        if (to === 'Fahrenheit') return (celsius * 9 / 5) + 32;
        if (to === 'Kelvin') return celsius + 273.15;
    }
}

class GraphPlotter {
    constructor() {
        this.canvas = document.getElementById('graph-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.input = document.getElementById('graph-func');
        this.plotBtn = document.getElementById('btn-plot');

        this.scale = 40; 
        this.offsetX = 0;
        this.offsetY = 0;

        this.initEventListeners();
        setTimeout(() => {
            this.resize();
            this.drawAxes();
        }, 100);
    }

    initEventListeners() {
        if (this.plotBtn) {
            this.plotBtn.addEventListener('click', () => this.plot());
        }
        if (this.input) {
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.plot();
            });
        }

        const zoomIn = document.getElementById('btn-zoom-in');
        const zoomOut = document.getElementById('btn-zoom-out');
        const reset = document.getElementById('btn-reset-view');

        if (zoomIn) zoomIn.addEventListener('click', () => this.zoom(1.2));
        if (zoomOut) zoomOut.addEventListener('click', () => this.zoom(0.8));
        if (reset) reset.addEventListener('click', () => this.resetView());

        window.addEventListener('resize', () => {
            if (this.canvas.offsetParent !== null) { 
                this.resize();
                this.plot();
            }
        });
    }

    resize() {
        const parent = this.canvas.parentElement;
        if (parent) {
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
            this.centerX = this.canvas.width / 2;
            this.centerY = this.canvas.height / 2;
        }
    }

    resetView() {
        this.scale = 40;
        this.offsetX = 0;
        this.offsetY = 0;
        this.plot();
    }

    zoom(factor) {
        this.scale *= factor;
        this.plot();
    }

    drawAxes() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const cx = this.centerX + this.offsetX;
        const cy = this.centerY + this.offsetY;

        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1;

        this.ctx.moveTo(0, cy);
        this.ctx.lineTo(this.canvas.width, cy);

        this.ctx.moveTo(cx, 0);
        this.ctx.lineTo(cx, this.canvas.height);

        this.ctx.stroke();
    }

    plot() {
        this.drawAxes();
        const expr = this.input.value.trim();
        if (!expr) return;

        let jsExpr = expr.toLowerCase()
            .replace(/sin/g, 'Math.sin')
            .replace(/cos/g, 'Math.cos')
            .replace(/tan/g, 'Math.tan')
            .replace(/log/g, 'Math.log10')
            .replace(/ln/g, 'Math.log')
            .replace(/sqrt|√/g, 'Math.sqrt')
            .replace(/\^/g, '**')
            .replace(/pi/g, 'Math.PI')
            .replace(/e/g, 'Math.E');

        let f;
        try {
            f = new Function('x', 'return ' + jsExpr);
            f(0); 
        } catch (e) {
            console.error("Invalid function", e);
            this.input.style.borderColor = 'red';
            return;
        }
        this.input.style.borderColor = 'var(--glass-border)';

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00f3ff'; 
        this.ctx.lineWidth = 2;

        const cx = this.centerX + this.offsetX;
        const cy = this.centerY + this.offsetY;

        let first = true;
        for (let px = 0; px < this.canvas.width; px++) {
            const x = (px - cx) / this.scale;
            try {
                const y = f(x);
                if (isNaN(y) || !isFinite(y)) {
                    first = true;
                    continue;
                }
                const py = cy - (y * this.scale);
                if (py < -5000 || py > 5000) {
                    first = true;
                    continue;
                }

                if (first) {
                    this.ctx.moveTo(px, py);
                    first = false;
                } else {
                    this.ctx.lineTo(px, py);
                }
            } catch (err) { }
        }
        this.ctx.stroke();
    }
}

class ProgrammerCalculator {
    constructor() {
        this.base = 10;
        this.currentValue = 0; 
        this.expression = '';
        this.isResult = false;

        this.screen = document.getElementById('prog-expression');
        this.displays = {
            16: document.getElementById('prog-hex'),
            10: document.getElementById('prog-dec'),
            8: document.getElementById('prog-oct'),
            2: document.getElementById('prog-bin')
        };

        this.initEventListeners();
        this.updateDisplays(0);
        this.updateScreen();
    }

    initEventListeners() {
        document.querySelectorAll('.base-row').forEach(row => {
            row.addEventListener('click', () => {
                document.querySelectorAll('.base-row').forEach(r => r.classList.remove('active'));
                row.classList.add('active');
                this.setBase(parseInt(row.dataset.base));
            });
        });

        document.querySelectorAll('.prog-keyboard .btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.closest('.prog-keyboard')) {
                    const action = btn.dataset.action;
                    const value = btn.dataset.value;
                    this.handleInput(action, value);
                }
            });
        });
    }

    setBase(base) {
        this.base = base;
        this.updateKeyboardState();
    }

    updateKeyboardState() {
        const hexBtns = ['A', 'B', 'C', 'D', 'E', 'F'];
        const nums = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

        const btns = document.querySelectorAll('.prog-keyboard .btn');

        btns.forEach(btn => {
            const val = btn.dataset.value;
            if (val) {
                let enabled = true;
                if (hexBtns.includes(val)) {
                    enabled = this.base === 16;
                } else if (nums.includes(val)) {
                    if (this.base === 2 && parseInt(val) > 1) enabled = false;
                    if (this.base === 8 && parseInt(val) > 7) enabled = false;
                }

                if (enabled) btn.classList.remove('btn-disabled');
                else btn.classList.add('btn-disabled');
            }
        });
    }

    handleInput(action, value) {
        if (this.isResult && (value || action === 'number')) {
            this.expression = '';
            this.isResult = false;
        }

        if (value) {
            this.expression += value;
        } else if (action === 'backspace') {
            this.expression = this.expression.slice(0, -1);
        } else if (action === 'clear') {
            this.expression = '';
            this.currentValue = 0;
            this.isResult = false;
        } else if (action === 'calculate') {
            this.calculate();
            return; 
        } else {
            switch (action) {
                case 'addition': this.expression += '+'; break;
                case 'subtraction': this.expression += '-'; break;
                case 'multiplication': this.expression += '*'; break;
                case 'division': this.expression += '/'; break;
                case 'and': this.expression += '&'; break;
                case 'or': this.expression += '|'; break;
                case 'xor': this.expression += '^'; break;
                case 'not': this.expression += '~'; break;
                case 'lsh': this.expression += '<<'; break;
                case 'rsh': this.expression += '>>'; break;
                case '(': this.expression += '('; break;
                case ')': this.expression += ')'; break;
            }
        }

        // For programmer mode, we calculate on the fly for simple number entry
        // But for expressions, we just show input (in DEC usually) or maintain specific display logic?
        // Simpler approach: Determine value of expression if possible, else just update text?
        // Actually, programmer calc usually evaluates whole expression. 
        // We will try to evaluate expression content to update displays if it looks like a number.

        // Complex expressions are hard to preview in all bases in realtime without parsing.
        // We will simple update displays based on "Current Input" if it is just digits,
        // or Result if calculated.

        // If expression contains operators, we assume user is typing expression
        // We can't easily show HEX of "5 + A" until computed.
        // So we only update displays if expression is empty (0) or after equals.
        // OR we can make a dedicated expression input for programmer mode?
        // Let's assume the displays show the CURRENT OPERAND or RESULT.

        // For MVP 3.0: 
        // 1. If user types number, update all displays.
        // 2. If user types operator, freeze displays until next number?

        // Let's implement: standard calculator behavior.
        // Display shows "Expression" in DEC? Or selected base?
        // The display logic in spec: 
        // "HEX 0", "DEC 0"...
        // Let's assume we update rows relative to the value entered.

        // Parsing input based on Current Base:
        // We need to parse 'expression' which might contain mixed base inputs? 
        // Usually programmer calcs operate in one base mode at a time.
        // So "A" in Hex is 10. "10" in Hex is 16.

        if (!this.expression) {
            this.updateDisplays(0);
        } else {
            const tokens = this.expression.split(/[\+\-\*\/\&\|\^\~\(\)\<\>]/);
            const lastToken = tokens[tokens.length - 1];
            if (lastToken) {
                try {
                    const val = parseInt(lastToken, this.base);
                    if (!isNaN(val)) this.updateDisplays(val);
                } catch (e) { }
            }
        }
        this.updateScreen();
    }

    calculate() {
        try {
            // We need to replace numbers in expression with decimal values based on their base context
            // This is tricky. Simplified: We assume ALL numbers in expression are of CURRENT Base.

            // Regex to find numbers
            const regex = /[0-9A-F]+/gi;
            const decimalExpr = this.expression.replace(regex, (match) => {
                return parseInt(match, this.base);
            });

            const result = new Function('return ' + decimalExpr)();

            this.currentValue = Math.floor(result); 
            this.isResult = true;
            this.expression = this.currentValue.toString(this.base).toUpperCase();

            this.updateDisplays(this.currentValue);
            this.updateScreen();

        } catch (err) {
            console.error(err);
            this.displays[10].textContent = "Error";
        }
    }

    updateDisplays(val) {
        try {
            const num = BigInt(val); // Handle larger numbers if possible, though JS bitwise is 32bit
            // JS Bitwise limited to 32 bit, but basic display can handle safe integer limits
            // Using Number for simplicity as bitwise ops cast to 32bit int32 anyway.
            const n = Number(num);

            this.displays[16].textContent = (n >>> 0).toString(16).toUpperCase();
            this.displays[10].textContent = n.toString(10);
            this.displays[8].textContent = (n >>> 0).toString(8);
            this.displays[2].textContent = (n >>> 0).toString(2);
        } catch (e) {
            this.displays[10].textContent = "Error";
        }
    }

    updateScreen() {
        if (this.screen) {
            this.screen.innerText = this.expression || '0';
            this.screen.scrollLeft = this.screen.scrollWidth;
        }
    }
}

class Calculator {
    constructor() {
        this.expressionDiv = document.getElementById('expression');
        this.resultDiv = document.getElementById('result');
        this.expression = '';
        this.result = '0';
        this.isEvaluated = false;

        this.isDegree = false; 
        this.modeToggleBtn = document.getElementById('mode-toggle');

        this.historyManager = new HistoryManager();
        this.initEventListeners();
        this.bindKeyboard();

        if (this.modeToggleBtn) {
            this.modeToggleBtn.addEventListener('click', () => {
                this.isDegree = !this.isDegree;
                this.modeToggleBtn.innerText = this.isDegree ? 'DEG' : 'RAD';
            });
        }

        document.addEventListener('loadHistory', (e) => {
            this.insert(e.detail);
        });
    }

    initEventListeners() {
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                let action = btn.dataset.action;
                const value = btn.dataset.value;

                if (!action && !isNaN(value)) {
                    action = 'number';
                }

                this.handleInput(action, value);

                this.animateButton(btn);
            });
        });

        this.replacements = [
            { key: '×', val: '*' },
            { key: '÷', val: '/' },
            // { key: 'sin', val: 'Math.sin' },
            { key: 'log', val: 'Math.log10' },
            { key: 'ln', val: 'Math.log' },
            { key: '√', val: 'Math.sqrt' },
            { key: 'π', val: 'Math.PI' },
            { key: 'e', val: 'Math.E' },
            { key: '^', val: '**' }
        ];
    }

    handleInput(action, value) {
        if (this.isEvaluated && (action === 'number' || action === 'func')) {
            this.clear();
        }
        this.isEvaluated = false;

        switch (action) {
            case 'number':
            case 'division':
            case 'multiplication':
            case 'subtraction':
            case 'addition':
            case 'decimal':
            case 'mod':
                this.insert(value);
                break;
            case 'clear':
                this.clear();
                break;
            case 'backspace':
                this.backspace();
                break;
            case 'calculate':
                this.calculate();
                break;

            case 'sin': this.insertFunc('sin('); break;
            case 'cos': this.insertFunc('cos('); break;
            case 'tan': this.insertFunc('tan('); break;
            case 'log': this.insertFunc('log('); break;
            case 'ln': this.insertFunc('ln('); break;
            case 'sqrt': this.insertFunc('√('); break;
            case 'pow': this.insert('^'); break;
            case 'fact': this.insert('!'); break; 
            case 'pi': this.insert('π'); break;
            case 'e': this.insert('e'); break;
            case '(': this.insert('('); break;
            case ')': this.insert(')'); break;
        }

        this.updateDisplay();
    }

    insert(val) {
        if (this.expression === '0' && !isNaN(val)) this.expression = '';
        
        if (val === '.') {
            const lastNumberMatch = this.expression.match(/[\d.]+$/);
            const lastNumber = lastNumberMatch ? lastNumberMatch[0] : '';
            
            if (lastNumber.includes('.')) {
                return;
            }
            
            if (this.expression === '' || /[+\-*/%(^]$/.test(this.expression)) {
                this.expression += '0';
            }
        }
        
        this.expression += val;
    }

    insertFunc(func) {
        if (this.expression === '0') this.expression = '';
        this.expression += func;
    }

    clear() {
        this.expression = '';
        this.result = '0';
        this.isEvaluated = false;
        this.updateDisplay();
    }

    backspace() {
        this.expression = this.expression.slice(0, -1);
        if (this.expression === '') this.result = '0';
        this.updateDisplay();
    }

    calculate() {
        if (!this.expression) return;

        try {
            let evalString = this.prepareExpression(this.expression);

            if (evalString.includes('!')) {
                evalString = this.handleFactorial(evalString);
            }

            let context = "";
            if (this.isDegree) {
                context += "const sin = x => Math.sin(x * Math.PI / 180); ";
                context += "const cos = x => Math.cos(x * Math.PI / 180); ";
                context += "const tan = x => Math.tan(x * Math.PI / 180); ";
            } else {
                context += "const sin = Math.sin; ";
                context += "const cos = Math.cos; ";
                context += "const tan = Math.tan; ";
            }

            const result = new Function(context + 'return ' + evalString)();

            if (!isFinite(result) || isNaN(result)) {
                throw new Error("Invalid");
            }

            const formattedResult = parseFloat(result.toFixed(8)).toString(); 

            this.historyManager.add(this.expression, formattedResult);
            this.result = formattedResult;
            this.expression = formattedResult;
            this.isEvaluated = true;
        } catch (err) {
            this.result = "Error";
            this.shakeDisplay();
        }
        this.updateDisplay();
    }

    prepareExpression(expr) {
        let cleanExpr = expr;

        this.replacements.forEach(rep => {
            cleanExpr = cleanExpr.split(rep.key).join(rep.val);
        });

        return cleanExpr;
    }

    handleFactorial(expr) {
        // Simple regex replace for single number factorials: 5! -> factorial(5)
        // Does not handle (5+2)! well without full parsing
        // We will implement a basic replace for digit!
        return expr.replace(/(\d+)!/g, (_, n) => {
            return this.mathFactorial(parseInt(n));
        });
    }

    mathFactorial(n) {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
    }

    updateDisplay() {
        this.expressionDiv.textContent = this.expression || '0';
        this.resultDiv.textContent = this.isEvaluated ? '' : (this.result !== 'Error' ? '' : 'Error');

        if (this.expression.length > 15) {
            this.expressionDiv.style.fontSize = '1.2rem';
        } else {
            this.expressionDiv.style.fontSize = '1.5rem';
        }
    }

    shakeDisplay() {
        this.expressionDiv.style.animation = 'none';
        this.expressionDiv.offsetHeight; 
        this.expressionDiv.style.animation = 'shake 0.3s';
    }

    animateButton(btn) {
        btn.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(0.9)' },
            { transform: 'scale(1)' }
        ], { duration: 150 });
    }

    bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            const key = e.key;

            if (!isNaN(key)) this.handleInput('number', key);
            if (key === '.') this.handleInput('decimal', '.');
            if (key === '+') this.handleInput('addition', '+');
            if (key === '-') this.handleInput('subtraction', '-');
            if (key === '*') this.handleInput('multiplication', '*');
            if (key === '/') this.handleInput('division', '/');
            if (key === 'Enter') { e.preventDefault(); this.handleInput('calculate'); }
            if (key === 'Backspace') this.handleInput('backspace');
            if (key === 'Escape') this.handleInput('clear');
            if (key === '%') this.handleInput('mod', '%');
            if (key === '(') this.handleInput('(', '(');
            if (key === ')') this.handleInput(')', ')');
        });
    }
}

class VoiceAssistant {
    constructor(calculator) {
        this.calculator = calculator;
        this.indicator = document.getElementById('voice-indicator');
        this.btn = document.querySelector('[data-action="voice-start"]');

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn("Speech API not supported");
            this.btn.style.display = 'none';
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'en-US'; 
        this.recognition.continuous = false;

        this.recognition.onstart = () => {
            this.indicator.classList.remove('hidden');
        };

        this.recognition.onend = () => {
            this.indicator.classList.add('hidden');
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            console.log("Voice Command:", transcript);
            this.processCommand(transcript);
        };

        this.btn.addEventListener('click', () => {
            this.recognition.start();
        });
    }

    processCommand(cmd) {
        let mathCmd = cmd.toLowerCase();
        mathCmd = mathCmd.replace(/plus/g, '+')
            .replace(/minus/g, '-')
            .replace(/times|multiplied by|x/g, '*')
            .replace(/divided by|divide/g, '/')
            .replace(/equals/g, '=')
            .replace(/square root/g, '√');

        const cleanMath = mathCmd.replace(/[^0-9+\-*/.=√]/g, '');

        if (cleanMath.length > 0) {
            for (let char of cleanMath) {
                if (char === '=') {
                    this.calculator.calculate();
                } else {
                    this.calculator.insert(char);
                }
            }
            this.calculator.updateDisplay();
        }
    }
}

class App {
    constructor() {
        this.calc = new Calculator();
        this.converter = new UnitConverter();
        this.graph = new GraphPlotter();
        this.prog = new ProgrammerCalculator();
        this.voice = new VoiceAssistant(this.calc);

        this.initTabs();
        this.initSidebar();
        this.initThemes();
    }

    initTabs() {
        const tabs = document.querySelectorAll('.nav-item[data-tab]');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                contents.forEach(c => {
                    c.id === `${target}-tab` ? c.classList.add('active') : c.classList.remove('active');
                });

                if (target === 'graph' && this.graph) {
                    setTimeout(() => {
                        this.graph.resize();
                        this.graph.plot();
                    }, 50); 
                }
            });
        });
    }

    initSidebar() {
        const historyBtn = document.querySelector('[data-action="toggle-history"]');
        const historyPanel = document.getElementById('history-panel');
        const closeHistory = document.getElementById('close-history');
        const clearHistory = document.getElementById('clear-history');
        const exportHistory = document.getElementById('export-history');

        const toggleHistory = () => {
            historyPanel.classList.toggle('open');
            if (historyPanel.classList.contains('open')) {
                this.calc.historyManager.clearNotification();
            }
        };

        historyBtn.addEventListener('click', toggleHistory);
        closeHistory.addEventListener('click', toggleHistory);

        clearHistory.addEventListener('click', () => this.calc.historyManager.clear());
        exportHistory.addEventListener('click', () => this.calc.historyManager.exportToFile());
    }

    initThemes() {
        const modal = document.getElementById('theme-modal');
        const openBtn = document.querySelector('[data-action="toggle-theme"]');
        const closeBtn = document.getElementById('close-modal');
        const themeOptionBtns = document.querySelectorAll('.theme-option');

        openBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });

        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        themeOptionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                document.body.setAttribute('data-theme', theme);
                localStorage.setItem('calc_theme', theme); 
                modal.classList.add('hidden');
            });
        });

        const savedTheme = localStorage.getItem('calc_theme');
        if (savedTheme) {
            document.body.setAttribute('data-theme', savedTheme);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.log('SW Failed', err));
    }
});
