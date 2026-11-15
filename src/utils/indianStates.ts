/** Indian state and union territory codes, keyed by lowercased name. */
const STATE_CODES: Record<string, string> = {
	"andaman and nicobar islands": "AN",
	"andhra pradesh": "AP",
	"arunachal pradesh": "AR",
	assam: "AS",
	bihar: "BR",
	chandigarh: "CH",
	chhattisgarh: "CG",
	"dadra and nagar haveli and daman diu": "DN",
	delhi: "DL",
	goa: "GA",
	gujarat: "GJ",
	haryana: "HR",
	"himachal pradesh": "HP",
	"jammu and kashmir": "JK",
	jharkhand: "JH",
	karnataka: "KA",
	kerala: "KL",
	ladakh: "LA",
	lakshadweep: "LD",
	"madhya pradesh": "MP",
	maharashtra: "MH",
	manipur: "MN",
	meghalaya: "ML",
	mizoram: "MZ",
	nagaland: "NL",
	odisha: "OD",
	puducherry: "PY",
	punjab: "PB",
	rajasthan: "RJ",
	sikkim: "SK",
	"tamil nadu": "TN",
	telangana: "TS",
	tripura: "TR",
	"uttar pradesh": "UP",
	uttarakhand: "UK",
	"west bengal": "WB",
};

const ALIASES: Record<string, string> = {
	orissa: "odisha",
	pondicherry: "puducherry",
	uttaranchal: "uttarakhand",
	"dadra and nagar haveli": "dadra and nagar haveli and daman diu",
	"daman and diu": "dadra and nagar haveli and daman diu",
	"new delhi": "delhi",
	"nct of delhi": "delhi",
};

/** Returns the two-letter code for a state name, or null when it is unknown. */
export function stateCodeFor(state: string): string | null {
	const key = state.trim().toLowerCase().replace(/\s+/g, " ");
	return STATE_CODES[ALIASES[key] ?? key] ?? null;
}

/** Lists the accepted state names, for error messages. */
export function stateNames(): string[] {
	return Object.keys(STATE_CODES).sort();
}
