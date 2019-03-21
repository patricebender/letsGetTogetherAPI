module.exports = function () {
	return {
		isEmpty: function (obj) {
			return Object.keys(obj).length === 0 && obj.constructor === Object;
		},
		round: function (value, exp) {
			if (typeof exp === "undefined" || +exp === 0) return Math.round(value);
			let roundedValue = +value;
			const newExp = +exp;

			console.log(value, exp);
			console.log(roundedValue, newExp);

			if (isNaN(roundedValue) || !(typeof newExp === "number" && newExp % 1 === 0)) return NaN;

			// Shift
			roundedValue = roundedValue.toString().split("e");
			roundedValue = Math.round(+(`${roundedValue[0]}e${roundedValue[1] ? (+roundedValue[1] + newExp) : newExp}`));

			// Shift back
			roundedValue = roundedValue.toString().split("e");
			return +(`${roundedValue[0]}e${roundedValue[1] ? (+roundedValue[1] - newExp) : -newExp}`);
		},
	};
};
