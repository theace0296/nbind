declare var __dirname: any;
declare var require: any;
declare var process: any;
declare var gc: any;

declare var Buffer: any;

import * as nbind from '..';
import * as testLib from './testlib';
import {Int64} from '../dist/int64';

const binding = nbind.init<typeof testLib>();
const testModule = binding.lib;

let prepareGC: (obj: any) => void;
var lost: any = null;

const global = (0 || eval)('this');

if(global.gc) {
	prepareGC = function(obj) { gc(); }
} else {
	console.warn('Garbage collector is not accessible. Faking it...');
	console.warn('Run Node.js with --expose-gc to disable this warning.');
	console.warn('');

	prepareGC = function(obj) { lost = obj; }

	global.gc = function() {
		if(lost) lost.free();
		lost = null;
	}
}

binding.toggleLightGC(true);

class Coord {
	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	fromJS(output: (x: number, y: number) => void) {
		output(this.x, this.y);
	}

	x: number;
	y: number;
}

type CoordJS = Coord;

declare module './testlib' {
	interface Coord extends CoordJS {}
}

test('Methods and primitive types', function(done) {
	var Type = testModule.PrimitiveMethods;

	(function() {
		var obj = new Type(0);

		expect(Type.negateStatic(false)).toBe(true);
		expect(obj.negate(false)).toBe(true);

		expect(Type.incrementIntStatic(1)).toBe(2);
		expect(obj.incrementInt(1)).toBe(2);

		expect(typeof Type.incrementStateStatic()).toBe('undefined');
		expect(Type.getStateStatic()).toBe(1);
		expect(typeof obj.incrementState()).toBe('undefined');
		expect(obj.getState()).toBe(2);

		expect(Type.strLengthStatic('foo')).toBe(3);
		expect(obj.strLength('foobar')).toBe(6);

		expect(Type.catenateStatic('foo', 'bar')).toEqual('foobar');
		expect(obj.catenate('Java', 'Script')).toEqual('JavaScript');
		expect(obj.catenate2('Java', 'Script')).toEqual('JavaScript');

		expect(Type.strLengthStatic(123 as any as string)).toBe(3);

		obj = new Type(0, 'quux');
		expect(Type.getStringStatic()).toBe('quux');
		expect(obj.getString()).toBe('quux');
	})();

	done();
});

test('Constructors and destructors', function(done) {
	const Type = testModule.PrimitiveMethods;

	(function() {
		let obj = new Type();
		expect(Type.getStateStatic()).toBe(42);

		obj = new Type(54);
		expect(Type.getStateStatic()).toBe(54);

		// Constructing with or without "new" operator should work identically.
		obj = (Type as any as (p0?: number) => testLib.PrimitiveMethods)();
		expect(Type.getStateStatic()).toBe(42);

		prepareGC(obj);

		obj = (Type as any as (p0?: number) => testLib.PrimitiveMethods)(54);
		expect(Type.getStateStatic()).toBe(54);

		gc();

		// Destructor should have incremented state.
		expect(Type.getStateStatic()).toBe(55);

		prepareGC(obj);

		expect(obj.negate(false)).toBe(true);
	})();

	gc();

	// Destructor should have incremented state again.
	expect(Type.getStateStatic()).toBe(56);

	done();
});

test('Functions', function(done) {
	expect(testModule.incrementInt(1)).toBe(2);
	expect(testModule.decrementInt(2)).toBe(1);

	done();
});

test('Getters and setters', function(done) {
	const Type = testModule.GetterSetter;
	const obj = new Type();

	expect(obj.x).toBe(1);
	expect(obj.y).toBe(2);
	expect(obj.z).toBe(3);
	expect(obj.t).toBe('foobar');
	expect(obj.XYZ).toBe(6);

	obj.y = 4;
	obj.z = 5;
	obj.t = 'foo';

	expect(obj.y).toBe(4);
	expect(obj.z).toBe(5);
	expect(obj.t).toBe('foo');

//	TODO: Add a property taking an object and check that a wrong type throws.
//	expect(function() {
//		obj.t = 0;
//	}, {message: 'Type mismatch'});

	done();
});

test('Callbacks', function(done) {
	const Type = testModule.Callback;

	expect(typeof Type.callVoidFunc(function() {})).toBe('undefined');
	expect(Type.callNegate(function(x: boolean) {return(!x);}, false)).toEqual(true);
	expect(Type.callNegate2(function(x: boolean) {return(!x);}, false)).toEqual(true);
	expect(Type.callAddInt(function(x: number, y: number) {return(x + y);}, 40, 2)).toEqual(42);
	expect(Type.callAddInt2(function(x: number, y: number) {return(x + y);}, 40, 2)).toEqual(42);
	expect(Type.callIncrementDouble(function(x: number) {return(x + 0.25);}, 0.5)).toEqual(0.75);
	expect(Type.callCatenate(function(x: string, y: string) {return(x + y);}, 'foo', 'bar')).toEqual('foobar');
	expect(Type.callCatenate2(function(x: string, y: string) {return(x + y);}, 'foo', 'bar')).toEqual('foobar');

	expect(function() {
		Type.callNegate({} as any as (x: boolean) => boolean, true);
	}).toThrowErrorMatchingSnapshot('callNegate error');

	Type.callCStrings(function(foo: string, bar: string, baz: string) {
		expect([foo, bar, baz]).toStrictEqual(['foo', 'bar', 'baz']);
	});

	if(process.versions.modules > 14) {
		// Node 0.12 and earlier seem unable to catch exceptions from callbacks.

		expect(function() {
			Type.callNegate(function(x: boolean) { throw(new Error('Test error')); }, true);
		}).toThrowErrorMatchingSnapshot('callNegate test error');
	}

	done();
});

test('Value objects', function(done) {
	const Type = testModule.Value;

//	expect(function() {
//		Type.getCoord()
//	}, {message: 'Value type JavaScript class is missing or not registered'});

	expect(typeof Type.getCoord()).toBe('object');

	binding.bind('Coord', Coord);

	var xy = Type.getCoord();

	expect(xy.x).toBe(60);
	expect(xy.y).toBe(25);

	xy.fromJS(function() {});
	xy = Type.callWithCoord(function(a: Coord, b: Coord) {
		expect(a.x).toBe(xy.x);
		expect(a.y).toBe(xy.y);
		expect(b.x).toBe(123);
		expect(b.y).toBe(456);

		// TODO: if we don't return a Coord here as expected by the C++ side, it crashes!
		return(a);
	}, xy, new Coord(123, 456));

	expect(xy.x).toBe(60);
	expect(xy.y).toBe(25);

	done();
});

test('Pointers and references', function(done) {
	const Type = testModule.Reference;

	const own = new Type();
	const value = Type.getValue();
	const ptr = Type.getPtr();
	const ref = Type.getRef();
	const constPtr = Type.getConstPtr();
	const constRef = Type.getConstRef();

	const types = [ own, value, ptr, ref, constPtr, constRef ];

	for(var i = 0; i < types.length; ++i) {
		expect(typeof Type.readPtr(types[i]!)).toBe('undefined');
		expect(typeof Type.readRef(types[i]!)).toBe('undefined');

		if(types[i] == constPtr || types[i] == constRef) {
			expect(function() {
				Type.writePtr(types[i]!);
			}).toThrowErrorMatchingSnapshot(`writePtr error ${i}`);

			expect(function() {
				Type.writeRef(types[i]!);
			}).toThrowErrorMatchingSnapshot(`writeRef error ${i}`);
		} else {
			expect(typeof Type.writePtr(types[i]!)).toBe('undefined');
			expect(typeof Type.writeRef(types[i]!)).toBe('undefined');
		}
	}

	expect(typeof ptr!.read()).toBe('undefined');
	expect(typeof ref.read()).toBe('undefined');

	expect(typeof ptr!.write()).toBe('undefined');
	expect(typeof ref.write()).toBe('undefined');

	expect(typeof constPtr.read()).toBe('undefined');
	expect(typeof constRef.read()).toBe('undefined');

	expect(function() {
		constPtr.write();
	}).toThrowErrorMatchingSnapshot('constPtr write error');

	expect(function() {
		constRef.write();
	}).toThrowErrorMatchingSnapshot('constRef write error');

	done();
});

test('Arrays', function(done) {
	const ArrayType = testModule.Array;
	const VectorType = testModule.Vector;

	const arr = [13, 21, 34];

	expect(ArrayType.getInts()).toEqual(arr);
	expect(VectorType.getInts()).toEqual(arr);

	expect(ArrayType.callWithInts(function(a: number[]) {
		expect(a).toEqual(arr);
		return(arr);
	}, arr)).toEqual(arr);

	expect(VectorType.callWithInts(function(a: number[]) {
		expect(a).toEqual(arr);
		return(arr);
	}, arr)).toEqual(arr);

	expect(function() {
		ArrayType.callWithInts(function(a: number[]) {}, [1, 2]);
	}).toThrowErrorMatchingSnapshot('arrays error');

	const arr2 = ['foo', 'bar', 'baz'];

	expect(VectorType.callWithStrings(function(a: string[]) {
		expect(a).toEqual(arr2);
		return(arr2);
	}, arr2)).toEqual(arr2);

	done();
});

test('Nullable', function(done) {
	const Type = testModule.Nullable;

	Type.foo(Type.getCoord()!);
	expect(Type.getNull()).toBe(null);
	expect(function() {
		Type.foo(null as any as testLib.Coord);
	}).toThrowErrorMatchingSnapshot('nullable error');

	Type.bar(null);

	done();
});

test('Strict conversion policy', function(done) {
	const typeList = [ testModule, testModule.StrictStatic, new testModule.Strict() ];

	for(let i = 0; i < typeList.length; ++i) {
		var Type = typeList[i];

		expect(Type.testInt(1)).toBe(1);
		expect(Type.testBool(true)).toBe(true);
		expect(Type.testString('foo')).toBe('foo');
		expect(Type.testCString('foo')).toBe('foo');
		expect(Type.testInt('123' as any as number)).toBe(123);
		expect(Type.testBool(0 as any as boolean)).toBe(false);
		expect(Type.testString(123 as any as string)).toBe('123');
		expect(Type.testCString(123 as any as string)).toBe('123');

		expect(Type.strictInt(1)).toBe(1);
		expect(Type.strictBool(true)).toBe(true);
		expect(Type.strictString('foo')).toBe('foo');
		expect(Type.strictCString('foo')).toBe('foo');

		expect(function() {
			Type.strictInt('123' as any as number);
		}).toThrowErrorMatchingSnapshot('strict conversion int error');

		expect(function() {
			Type.strictBool(0 as any as boolean);
		}).toThrowErrorMatchingSnapshot('strict conversion bool error');

		expect(function() {
			Type.strictString(123 as any as string);
		}).toThrowErrorMatchingSnapshot('strict conversion string error');

		expect(function() {
			Type.strictCString(123 as any as string);
		}).toThrowErrorMatchingSnapshot('strict conversion cstring error');
	}

	done();
});

test('Inheritance', function(done) {
	const A = testModule.InheritanceA;
	const B = testModule.InheritanceB;
	const C = testModule.InheritanceC;
	const D = testModule.InheritanceD;

	const d: any = new D();

	expect(d instanceof A).toBeTruthy();
	expect(d instanceof B || d instanceof C).toBeTruthy();
	expect(d instanceof D).toBeTruthy();

	expect(d.a instanceof A).toBeTruthy();
	expect(d.b instanceof A).toBeTruthy();
	expect(d.c instanceof A).toBeTruthy();

	expect(d.b instanceof B).toBeTruthy();
	expect(d.c instanceof C).toBeTruthy();

	expect(d.b.a instanceof A).toBeTruthy();
	expect(d.c.a instanceof A).toBeTruthy();

	expect(function() {
		d.useA.call(new Date());
	}).toThrowErrorMatchingSnapshot('inheritance date error');

	expect(d.useA()).toBe(1);
	expect(d.useB()).toBe(2);
	expect(d.useC()).toBe(3);
	expect(d.useD()).toBe(4);

	expect(d.a.useA()).toBe(1);
	expect(d.b.useB()).toBe(2);
	expect(d.c.useC()).toBe(3);

	expect(d.b.a.useA()).toBe(1);
	expect(d.c.a.useA()).toBe(1);

	expect(A.staticA(d)).toBe(1);
	expect(A.staticA(d.b)).toBe(1);
	expect(A.staticA(d.c)).toBe(1);

	expect(B.staticB(d)).toBe(2);
	expect(B.staticB(d.b)).toBe(2);
	expect(function() {
		B.staticB(d.c as any);
	}).toThrowErrorMatchingSnapshot('inheritance B error');

	expect(C.staticC(d)).toBe(3);
	expect(C.staticC(d.c)).toBe(3);
	expect(function() {
		C.staticC(d.b as any);
	}).toThrowErrorMatchingSnapshot('inheritance C error');

	done();
});

test('64-bit integers', function(done) {
	const Type = testModule.PrimitiveMethods;
	let lastDigit: string;

	let x = Type.ftoul(42);
	let y = Type.ftol(42);
	let z = Type.ftol(-42);

	expect(Type.ultof(x)).toBe(42);
	expect(Type.ltof(y)).toBe(42);
	expect(Type.ltof(z)).toBe(-42);

	for(var j = 0; j < 2; ++j) {
		for(var n = 2, i = 1; i < 63; ++i) {
			x = Type.ftoull(n);
			y = Type.ftoll(n);
			z = Type.ftoll(-n);

			expect(Type.ulltof(x)).toBe(n);
			expect(Type.lltof(y)).toBe(n);
			expect(Type.lltof(z)).toBe(-n);

			if(j) {
				lastDigit = '5137'.charAt(i & 3);
				expect(('' + x).substr(-1)).toBe(lastDigit);
				expect(('' + y).substr(-1)).toBe(lastDigit);
				expect(('' + z).substr(-1)).toBe(lastDigit);
			}

			n *= 2;
		}

		binding.bind('Int64', Int64);
	}

	done();
});

test('Overloaded functions', function(done) {
	const Type = testModule.Overload;
	const obj = new Type();

	expect(obj.test(0)).toBe(1);
	expect(obj.test2(0, 0)).toEqual(2);

	expect(obj.testConst(0)).toBe(1);
	expect(obj.testConst2(0, 0)).toEqual(2);

	expect(Type.testStatic(0)).toBe(1);
	expect(Type.testStatic2(0, 0)).toEqual(2);

	expect(testModule.multiTest(0)).toBe(1);
	expect(testModule.multiTest2(0, 0)).toEqual(2);

	done();
});

test('Smart pointers', function(done) {
	const Type = testModule.Smart;

	const obj = Type.make(31337);

	obj!.test();
	Type.testStatic(obj!);
	Type.testShared(obj!);

	obj!.free!();
	// obj.free();

	done();
});

test('Buffers', function(done) {
	const Type = testModule.Buffer;
	let buf: any;

	if(ArrayBuffer && (typeof(process) != 'object' || typeof(process.versions) != 'object' || process.versions.modules >= 14)) {
		buf = new ArrayBuffer(16);
		var view = new Uint8Array(buf);

		for(var i = 0; i < 16; ++i) view[i] = i;

		expect(Type.sum(buf)).toBe(120);
		expect(Type.sum(view)).toBe(120);
		expect(Type.sum(view.subarray(2, 12))).toEqual(65);
		expect(Type.sum(new Uint8Array(buf, 2, 12))).toEqual(90);

		Type.mul2(buf);

		expect(Type.sum(buf)).toBe(240);

		Type.mul2(view);

		expect(Type.sum(view)).toBe(480);
	}

	if(Buffer) {
		buf = Buffer.alloc ? Buffer.alloc(16) : new Buffer(16);

		for(var i = 0; i < 16; ++i) buf[i] = i;

		expect(Type.sum(buf)).toBe(120);

		Type.mul2(buf);

		expect(Type.sum(buf)).toBe(240);
	}

	done();
});

test('Reflection', function(done) {
	const reflect = new (require('../dist/reflect.js').Reflect)(binding);
	expect(reflect.dumpPseudo().replace(/int64/g, 'int32')).toMatchSnapshot('reflection');
	done();
});
