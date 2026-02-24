import { createTimer } from "animejs";

export const getID = function(id) {
	return document.getElementById(id);
}
export const addCl = function(el,cls) {
	if (Array.isArray(cls)) {
		for(let i = cls.length-1; i>=0; i--) {
			el.classList.add(cls[i]);
		}
	} else {
		el.classList.add(cls);
	}
}
export const remCl = function(el,cls) {
	if (Array.isArray(cls)) {
		for(let i = cls.length-1; i>=0; i--) {
			el.classList.remove(cls[i]);
		}
	} else {
		el.classList.remove(cls);
	}
}
export const addEv = function(el,evts,hndlr) {
	if (Array.isArray(evts)) {
		for(let i = evts.length-1; i>=0; i--) {
			el.addEventListener(evts[i],hndlr,false);
		}
	} else {
		el.addEventListener(evts,hndlr,false);
	}
}
export const remEv = function(el,evts,hndlr) {
	if (Array.isArray(evts)) {
		for(let i = evts.length-1; i>=0; i--) {
			el.removeEventListener(evts[i],hndlr,false);
		}
	} else {
		el.removeEventListener(evts,hndlr,false);
	}
}
export const randInt = function (min, max) {
	return Math.floor(Math.random() * (max - min) + min);
}
export const randFloat = function (min, max) {
	const str = (Math.random() * (max - min) + min).toFixed(1);
	return parseFloat(str);
}
export const animeTimeout = (callback, delay) => {
	return createTimer({
		duration: delay,
		onComplete: () => {
			callback();
		}
	});
}
export const wait = async (duration) => {
	return await createTimer({duration});
}