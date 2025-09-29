
export {};

// lazy
type map<K extends string | number | symbol, T> = Record<K, T>
declare global {
    interface Object {
        merge(obj: map<string, number>, op: op): Object;
        elementWise(num: number, op: op): Object;
        reverse(): Object;
    }
}

Object.prototype.merge = function(obj: map<string, number>, op: op){
    let main = this as map<string,number>;
    for (let k of Object.keys(obj)) {
        if (Object.hasOwn(main, k)) {
            if (typeof obj[k] === "number" && typeof main[k] === "number") {
                if (Object.keys(builtin).includes(op)) {
                    main[k] = builtin[op](main[k], obj[k])
                } else main[k] = eval(main[k]+op+obj[k])
            }
        } else {
            // direct assignment if there's no prop sync
            main[k] = obj[k]
        }
    }
    return main;
}

Object.prototype.elementWise = function(num: number, op: op){
    let main = this as map<string,number>;
    for (let k of Object.keys(main)) {
        if (typeof main[k] === "number") {
            if (Object.keys(builtin).includes(op)) {
                main[k] = builtin[op](main[k], num)
            } else main[k] = eval(main[k]+op+num)
        }
    }
    return main;
}

export type token = string | number;
interface AtomicParseOption {
    grad?: boolean,
    propMap?: map<string, Object>,
    passdown?: map<string, Object>
}

export type GradMode = "backward" | "forward" | "diff";

export type Child = Operator | Atomic | Accumulator;

export type op =
        "+"  |
        "-"  |
        "*"  |
        "/"  |
        "^"  |
        "ln" |
        "max"|
        "min"

export const builtin: map<string, Function> = {
    "sin": (x: number) => Math.sin(x),
    "cos": (x: number) => Math.cos(x),
    "max": (x1: number,x2: number) => Math.max(x1,x2),
    "min": (x1: number,x2: number) => Math.min(x1,x2),
    "ln": (x: number) => Math.log(x)
}

export class Atomic {

    constructor (
        public _val: number
    ) {
    }
    val() {
        return this._val;
    }

    diff(sel: string[] = []) {
        let grad: map<string, Atomic> = {};
        for (let s of sel) {
            grad[s] = new Atomic(0);
        }
        return grad
    }

    backward() {
        return 0;
    }

    forward() {
        return {};
    }
}

export class Operator {
    constructor(
        public op: op,
        public values: Child[],
        public backward: Function,
        public forward: Function,
        public diff: Function,
        public val: Function
    ) {}

    static new(op: op, values: Child[]): Child {
        switch (op) {
            case "+":
                if (values[0].constructor.name === "Atomic" && values[1].constructor.name === "Atomic") {
                    return new Atomic(values[0].val()+values[1].val())
                } else if (values[0].constructor.name === "Atomic" && values[0].val() === 0) {
                    return values[1];
                } else if (values[1].constructor.name === "Atomic" && values[1].val() === 0) {
                    return values[0];
                }
                break;
            case "-":
                if (values[0].constructor.name === "Atomic" && values[1].constructor.name === "Atomic") {
                    return new Atomic(values[0].val()-values[1].val())
                } else if (values[0].constructor.name === "Atomic" && values[0].val() === 0) {
                    return Operator.new("*", [values[1], new Atomic(-1)])
                } else if (values[1].constructor.name === "Atomic" && values[1].val() === 0) {
                    return values[0]
                }
                break;
            case "*":
                if (values[0].constructor.name === "Atomic" && values[1].constructor.name === "Atomic") {
                    return new Atomic(values[0].val()*values[1].val())
                } else if (values[0].constructor.name === "Atomic" && values[0].val() === 0) {
                    return new Atomic(0);
                } else if (values[1].constructor.name === "Atomic" && values[1].val() === 0) {
                    return new Atomic(0);
                }
                break;
            case "/":
                if (values[0].constructor.name === "Atomic" && values[1].constructor.name === "Atomic") {
                    return new Atomic(values[0].val()/values[1].val())
                } else if (values[0].constructor.name === "Atomic" && values[0].val() === 0) {
                    return new Atomic(0);
                } else if (values[1].constructor.name === "Atomic" && values[1].val() === 0) {
                    throw new Error("Division by 0 detected")
                }
                break;
            case "^":
                if (values[0].constructor.name === "Atomic" && values[1].constructor.name === "Atomic") {
                    return new Atomic(values[0].val()**values[1].val())
                } else if (values[0].constructor.name === "Atomic" && values[0].val() === 0) {
                    return new Atomic(0);
                } else if (values[1].constructor.name === "Atomic" && values[1].val() === 0) {
                    return values[1]
                }
                break;
            case "^":
                if (values[0].constructor.name === "Atomic") {
                    return new Atomic(Math.log(values[0].val()))
                } else if (values[0].constructor.name === "Atomic" && values[0].val() === 1) {
                    return new Atomic(0);
                } else if (values[0].constructor.name === "Atomic" && values[0].val() < 0) {
                    throw new Error("Invalid ln value")
                }
                break;
        }
        return new Operator(
            op, 
            values, 
            Engine.gradStock[op].backward,
            Engine.gradStock[op].forward,
            Engine.gradStock[op].diff,
            Engine.gradStock[op].val,
        )
    }
}


/**
 * Accumulator for backward mode
 */
export class Accumulator {
    private _val: number;
    private _gradient: number; get gradient() {return this._gradient}

    val() {
        return this._val
    }

    constructor(
        public binding: string
    ) {
        this._gradient = 1;
        this._val = NaN;
    }

    diff(sel: string[] = []) {
        let grad: map<string, Atomic> = {};
        for (let s of sel) {
            if (s === this.binding) grad[s] = new Atomic(1);
            else grad[s] = new Atomic(0);
        }
        return grad
    }

    forward() {
        let grad: map<string, number> = {};
        grad[this.binding] = 1;
        return grad;
    }

    backward(grad: number) {
        this._gradient+=grad;
    }

    putVal(x: number) {
        this._val = x;
    }

    resetGradient() {
        this._gradient = 0;
    }

    modifyVal(value: number, op: op) {
        switch(op) {
            case "+":
                this._val += value;
                break;
            case "-":
                this._val -= value;
                break;
            case "*":
                this._val *= value;
                break;
            case "/":
                this._val /= value;
                break;
            case "^":
                this._val **= value;
                break;
            case "max":
            case "min":
                this._val = builtin[op](this._val, value);
                break;
        }
    }
}

const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function cyclicHash(count: number, maxl: number) {
    let l = [];
    for (let i = 0; i < maxl; i++) {
        let cv = count%characters.length;
        if (i === 0) l.push(characters.charAt(cv))
        else {
            let v = Math.floor(count/characters.length**i)%characters.length
            l.push(characters.charAt(v))
        }
    }
    return l.reverse().join("");
}

function $(strs: TemplateStringsArray, ...values: any[]) {
    let bind = [], keybind = [], output = "", vcount = 0;

    for (let i = 0; i < values.length; i++) {
        let bound = false;
        output+=strs[i]
        for (let j = 0; j < bind.length; j++) {
            let b = bind[j];
            if (b.equal(values[i])) {
                output+=keybind[j]
                bound = true;
                break;
            }
        }
        if (!bound) {
            bind.push(values[i]);
            keybind.push(cyclicHash(vcount++,3))
            output+=keybind[keybind.length-1]
        }
    }
    let kmap: map<string, any> = {};
    for (let i = 0; i < keybind.length; i++) {
        kmap[keybind[i]] = bind[i];
    }
    let os = output+strs[strs.length-1];
    return [os,kmap] as [string, map<string, any>];
}
export class Optimizer {
    constructor() {}

    static momentumCoef: number = 0.9;

    static sgd(
        grad: Operator, 
        accumulators: Accumulator[], 
        step: number = 1, 
        lr: number = 0.01, 
        maximise: boolean = false, 
        momentum: number = 0,
        dampening: number = 0,
        nesterov: boolean = false
    ) {
        let velocity: map<string, number> = {};
        let gmul = maximise ? -1 : 1
        if (momentum > 0) {
            for (let acc of accumulators) velocity[acc.binding] = 0;
        }
        for (let i = 0; i < step; i++) {
            grad.backward();
            for (let acc of accumulators) {
                let gt = acc.gradient*gmul
                if (momentum!==0) {
                    if (dampening > 1) {
                        velocity[acc.binding] = velocity[acc.binding]*momentum + (1-dampening)*gt;
                    } else {
                        velocity[acc.binding] = gt;
                    }
                    if (nesterov) {
                        gt = gt + momentum*velocity[acc.binding]
                    } else {
                        gt = velocity[acc.binding];
                    }
                }
                acc.modifyVal(gt*lr, "-")
            }
        }
    }

    /**
     * Do not use Halley's method if the function contains max/min or other functions with non-trivial 2nd order derivative
     */
    static newton(
        grad: Operator, 
        accumulator: Accumulator, 
        step: number = 1,
        halley: boolean = false
    ) {
        let sdiff;
        if (halley) {
            sdiff = grad.diff([accumulator.binding])[accumulator.binding];
        }

        for (let i = 0; i < step; i++) {
            grad.backward()
            if (halley) {
                let f = grad.val();
                let fd = accumulator.gradient*accumulator.val();
                sdiff.backward();
                let fdd = accumulator.gradient*accumulator.val();

                let modifier = (f*fd)/(fd**2-1/2*f*fdd)
                accumulator.modifyVal(modifier, "-");
            } else {
                accumulator.modifyVal(grad.val()/(accumulator.gradient*accumulator.val()),"-")
            }
        }
    }
}

export class Engine {
    constructor(){}

    static gradStock = {
        "+": {
            diff: function(sel: string[] = []){
                //@ts-ignore
                let node = (this as Operator)
                let values: Child[] = node.values

                let d: map<string, Child> = {}

                for (let s of sel) {
                    d[s] = Operator.new("+", [values[0].diff(sel)[s], values[1].diff(sel)[s]])
                }
                return d;
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values
                let o = values[0].forward().merge(values[1].forward(), "+");
                return o;
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values
                values[0].backward(grad); values[1].backward(grad);
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return values[0].val() + values[1].val()
            }
        },
        "-": {
            diff: function(sel: string[] = []){
                //@ts-ignore
                let node = (this as Operator)
                let values: Child[] = node.values

                let d: map<string, Child> = {}

                for (let s of sel) {
                    d[s] = Operator.new("-", [values[0].diff(sel)[s], values[1].diff(sel)[s]])
                }
                return d;
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values
                return values[0].forward().merge(values[1].forward(), "-");
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values
                values[0].backward(grad); values[1].backward(-grad);
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return values[0].val() - values[1].val()
            }
        },
        "*": {
            diff: function(sel: string[] = []){
                //@ts-ignore
                let node = (this as Operator)
                let values: Child[] = node.values

                let d: map<string, Child> = {}

                for (let s of sel) {
                    d[s] = Operator.new("+", [
                        Operator.new("*", [values[0].diff(sel)[s], values[1]]), 
                        Operator.new("*", [values[1].diff(sel)[s], values[0]])
                    ])
                }
                return d;
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values
                let o = values[0].forward().elementWise(values[1].val(), "*").merge(values[1].forward().elementWise(values[0].val(), "*"), "+");
                return o;
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values
                values[0].backward(grad*values[1].val()); values[1].backward(grad*values[0].val());
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return values[0].val() * values[1].val()
            }
        },
        "/": {
            diff: function(sel: string[] = []){
                //@ts-ignore
                let node = (this as Operator)
                let values: Child[] = node.values

                let d: map<string, Child> = {}

                for (let s of sel) {
                    d[s] = Operator.new("-", [
                        Operator.new("/",[values[0].diff(sel)[s],values[1]]), 
                        Operator.new("/",[
                            values[1].diff(sel)[s],
                            Operator.new("^",[values[1], new Atomic(2)])
                        ])
                    ])
                }
                return d;
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values

                let v = values[1].val();

                return values[0].forward().elementWise(1/v, "*")
                                .merge(values[1].forward().elementWise(-values[0].val()/v**2, "*"))
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values

                let v = values[1].val();


                values[0].backward(grad/v); values[1].backward(-grad*values[0].val()/v**2);
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return values[0].val() / values[1].val()
            }
        },
        // d uv = du + dv = (vu'/u)u^v + (ln(u)v')u^v = u^v(vu'/u + ln(u)v')
        "^": {
            diff: function(sel: string[] = []){
                //@ts-ignore
                let node = (this as Operator)
                let values: Child[] = node.values

                let d: map<string, Child> = {}

                for (let s of sel) {
                    d[s] = Operator.new("*", [
                        Operator.new("^", [values[0], values[1]]),
                        Operator.new("+", [
                            Operator.new("/", [
                                Operator.new("*", [
                                    values[1],
                                    values[0].diff(sel)[s]
                                ]),
                                values[0]
                            ]),
                            Operator.new("*", [
                                Operator.new("ln", [values[0]]),
                                values[1].diff(sel)[s]
                            ])
                        ])
                    ])
                }
                return d;
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values
                let u = values[0].val(), v = values[1].val();

                let o = values[0].forward().elementWise(v*u**(v-1), "*")
                                            .merge(values[1].forward().elementWise(Math.log(u)*u**v), "+");
                return o;
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values


                let u = values[0].val(), v = values[1].val();

                values[0].backward(grad*v*u**(v-1)); values[1].backward(grad*Math.log(u)*u**v);
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return values[0].val() ** values[1].val()
            }
        },
        "ln": {
            diff: function(sel: string[] = []){
                //@ts-ignore
                let node = (this as Operator)
                let values: Child[] = node.values

                let d: map<string, Child> = {}

                for (let s of sel) {
                    d[s] = Operator.new("/", [values[0].diff(sel)[s], values[0].val()])
                }
                return d;
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values
                return values[0].forward().elementWise(values[0].val, "/")
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values
                values[0].backward(grad/values[0].val());
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return Math.log(values[0].val())
            }
        },
        "max": {
            diff: function(sel: string[] = []){
                throw new Error("The first order derivative of max() returns a non-differentiable function. Use forward or backward accumulation instead. If 2nd order differentiation is required, use softmax (soon)")
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values
                let v1 = values[0].val(), v2 = values[1].val();
                if (v1 === v2) {
                    return values[0].forward().elementWise(0.5, "*").merge(values[1].forward().elementWise(0.5, "*"),"+")
                }
                else if (v1 > v2) values[0].forward()
                else return values[1].forward();
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values
                let v1 = values[0].val(), v2 = values[1].val();
                if (v1 === v2) {values[0].backward(grad*0.5); values[1].backward(grad*0.5)}
                else if (v1 > v2) values[0].backward(grad)
                else values[1].backward(grad);
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return Math.max(values[0].val(), values[1].val())
            }
        },
        "min": {
            diff: function(sel: string[] = []){
                throw new Error("The first order derivative of min() returns a non-differentiable function. Use forward or backward accumulation instead. If 2nd order differentiation is required, use softmin (soon)")
            },
            forward: function() {
                //@ts-ignore
                let values: Child[] = this.values
                let v1 = values[0].val(), v2 = values[1].val();
                if (v1 === v2) {
                    return values[0].forward().elementWise(0.5, "*").merge(values[1].forward().elementWise(0.5, "*"),"+")
                }
                else if (v1 < v2) values[0].forward()
                else return values[1].forward();
            },
            backward: function(grad: number = 1) {
                //@ts-ignore
                let values: Child[] = this.values
                let v1 = values[0].val(), v2 = values[1].val();
                if (v1 === v2) {values[0].backward(grad*0.5); values[1].backward(grad*0.5)}
                else if (v1 < v2) values[0].backward(grad)
                else values[1].backward(grad);
            },
            val: function(){
                //@ts-ignore
                let values: Child[] = this.values
                return Math.min(values[0].val(), values[1].val())
            }
        },
    }

    static baseParam = {
        "sin": 1,
        "cos": 1,
        "ln": 1,
        "max": 2,
        "min": 2,
        "+": 2,
        "-": 2,
        "*": 2,
        "/": 2,
        "^": 2
    }


    static basePrecedence = {
        "sin": 4,
        "cos": 4,
        "max": 4,
        "min": 4,
        "ln": 4,
        "+": 1,
        "-": 1,
        "*": 2,
        "/": 2,
        "^": 3
    }

    static isNumber = (txt: string) => (/(-{0,1}0{0,1}\.{0,1}[0-9]+)/g).test(txt);

    static isPlaintext = (txt: string) => (/([A-Za-z]+[A-Za-z0-9_]*)/g).test(txt);

    static tokenize(stream: string) {
        let charset = stream.split("");
        let ptr = 0;
        let tok = [];
        let strbuff = "",numbuff = ""
        while (ptr < charset.length) {
            if (this.isNumber(charset[ptr])) {
                numbuff+=charset[ptr++];
                continue;
            } else {
                if (numbuff.length !== 0) {
                    tok.push(Number(numbuff));
                    numbuff = "";
                }
            }

            if (this.isPlaintext(charset[ptr])) {
                strbuff+=charset[ptr++];
                continue;
            } else {
                if (strbuff.length !== 0) {
                    tok.push(strbuff);
                    strbuff = "";
                }
            }

            tok.push(charset[ptr++]);
        }

        if (numbuff !== "") {
            tok.push(Number(numbuff));
            numbuff = "";
        }

        if (strbuff !== "") {
            tok.push(strbuff);
            strbuff = "";
        }

        tok = tok.filter(x => x!==" "&&x!=="\n")

        return tok;
    }

    static preprocessor(tok: token[]) {
        let prec = JSON.parse(JSON.stringify(this.basePrecedence))
        let symbolTable: map<string, number> = {};
        let optype = Object.keys(prec);
        let ptr = 0;
        let expect = (x: string) => {
            if (tok[ptr] === x) ptr+=1
            else throw new Error("Expected "+x)
        }
        let assertVariable = () => {
            let tokstr = tok[ptr].toString();
            if (this.isPlaintext(tokstr) && !optype.includes(tokstr) && !Object.keys(symbolTable).includes(tokstr)) {
                return tok[ptr++];
            }
            else throw new Error("No varname found")
        }
        while (ptr < tok.length-1) {
            if (tok[ptr] === "var") {
                ptr+=1;
                let name = assertVariable();
                expect("=");
                symbolTable[name] = 0;
                continue;
            }
            if (tok[ptr] === "def") {
                let name = assertVariable();
                symbolTable[name] = 0;
                tok.splice(--ptr,2);
                continue;
            }
            ptr+=1;
        }
        return symbolTable
    }

    static parseExpr(tok: token[]) {
        let prec = JSON.parse(JSON.stringify(this.basePrecedence))
        let opstack: string[] = [], out: token[] = [];
        let optype = Object.keys(prec);
        let ptr = 0;
        while (ptr < tok.length) {
            let tokstr = tok[ptr].toString();
            if (typeof tok[ptr] === typeof 2 || (this.isPlaintext(tokstr) && !optype.includes(tokstr))) {
                out.push(tok[ptr++]);
                continue;
            }

            if (optype.includes(tokstr)) {
                if (opstack.length === 0 || opstack[opstack.length-1] === "(") {
                    opstack.push(tok[ptr++] as string);
                    continue;
                }
                if (prec[tok[ptr]] > prec[opstack[opstack.length - 1]]) {
                    opstack.push(tok[ptr++] as string);
                } else {
                    while (prec[tok[ptr]] <= prec[opstack[opstack.length - 1]]) {
                        out.push(opstack.pop() as string);
                    }
                    opstack.push(tok[ptr++] as string);
                }
                continue;
            }

            if (tok[ptr] === "(") {
                opstack.push(tok[ptr++] as string);
                continue
            }

            if (tok[ptr] === ")") {
                while (opstack.length > 0) {
                    let op = opstack.pop();
                    if (op === "(") break;
                    out.push(op as string);
                }
            }
            ptr+=1;
        }
        if (opstack.length !== 0) {
            out.push(...opstack.reverse())
        }
        return out;
    }

    static parse(tok: token[]) {
        let prec = JSON.parse(JSON.stringify(this.basePrecedence))
        let out: map<string, token[]>= {};
        let optype = Object.keys(prec);
        let expect = (x: string) => {
            if (tok[0] === x) {
                tok.splice(0,1);
                return;
            }
            throw new Error("Expected "+x);
        }
        let assertName = () => {
            let tokstr = tok[0].toString()
            if (this.isPlaintext(tokstr) && !optype.includes(tokstr)) {
                return tok.splice(0,1)[0].toString()
            }
            else throw new Error("No variable name found")
        }
        while (tok.length > 0) {
            if (tok[0] === "var") {
                tok.splice(0,1);
                let idx = tok.indexOf("var") - 2;
                if (idx === -3) idx = tok.length - 1;
                let name = assertName()!;
                expect("=");
                out[name] = this.parseExpr(tok.splice(0, idx));
            } else {
                break;
            }
        }
        return out;
    }

    static buildAst(r: token[], symbolTable: map<string, number>, propmap: map<string, any> = {}) {
        let prec = JSON.parse(JSON.stringify(this.basePrecedence))
        let vtable = JSON.parse(JSON.stringify(this.baseParam))
        let rpn: (token | Child)[] = [...r];
        let ptr = 0;
        let op = [...Object.keys(prec)];
        let vset: map<string, Accumulator> = {};
        while (rpn.length > 1) {
            if (rpn[ptr] == undefined) break;
            if (!op.includes(rpn[ptr] as string)) {
                ptr+=1;
            } else {
                let vt = vtable[rpn[ptr] as string];
                let proplist: (number | string | Child)[] = [];
                let collapsible = true;
                for (let i = 1; i <= vt; i++) {
                    proplist.push(rpn[ptr-i]);
                    if (typeof rpn[ptr-i] !== "number") collapsible = false;
                }
                proplist = proplist.reverse();
                for (let i = 0; i < proplist.length; i++) {
                    if (propmap[proplist[i] as string]) proplist[i] = propmap[proplist[i] as string];
                    if (typeof proplist[i] === "number") proplist[i] = new Atomic(proplist[i] as number)
                    else {
                        if (!Object.keys(symbolTable).includes(proplist[i] as string) && typeof proplist[i] === "string") {
                            if (!Object.keys(vset).includes(proplist[i] as string)) {
                                let accu = new Accumulator(proplist[i] as string);
                                vset[proplist[i] as string] = accu;
                                proplist[i] = accu;
                            } else {
                                proplist[i] = vset[proplist[i] as string];
                            }
                        }
                    }
                }
                let obj;
            
                if (collapsible) {
                    if (Object.keys(builtin).includes(rpn[ptr] as string)) {
                        obj = new Atomic(builtin[rpn[ptr] as string](...proplist as number[]));
                    } else {
                        obj = new Atomic(eval(proplist.join(rpn[ptr] as string)))
                    }
                } else {
                    obj = Operator.new(rpn[ptr] as op,proplist as Child[])
                }
            
                rpn.splice(ptr-vt,vt+1, obj)
                ptr-=vt;
            }
        }
        return this.makeGrad(rpn[0] as Operator, vset)
    }

    static makeGrad(tree: Operator, accumulators: map<string, Accumulator>) {
        return {
            tree: tree,
            accumulators: accumulators,
            /**
             * set = set of variables
             * if diff mode : set can be random values, as the actual differential function is returned
             * default mode is "diff" (JAX style)
             */
            grad: function(set: map<string, number>, mode: GradMode = "diff") {
                for (let k of Object.keys(this.accumulators)) {
                    //reset accummulator
                    if (set[k]) {
                        this.accumulators[k].putVal(set[k]);
                    } else {
                        this.accumulators[k].putVal(0);
                    }
                    this.accumulators[k].resetGradient();
                }
                switch (mode) {
                    case "backward":
                        this.tree.backward()
                        break;
                    case "forward":
                        return this.tree.forward()
                    case "diff":
                        return Engine.makeGrad(this.tree.diff(Object.keys(set)), this.accumulators)
                }
            }
        }
    }

    static buildGradSyntaxTree(str: string) {
        let tokens = this.tokenize(str)
        let preprocessed = this.preprocessor(tokens);

        let postfix = this.parse(tokens);


        let exprObj = Object.values(postfix).map(x => this.buildAst(x, preprocessed)), exprName = Object.keys(postfix);
        let ast: map<string, any> = {};
        for (let i = 0; i < exprObj.length; i++) ast[exprName[i]] = exprObj[i];
        return ast;
    }
}

