/**
 * Simple XML stringifier for Omaha protocol responses
 * Converts a JS object to XML string
 */

type XmlValue = string | number | boolean | null | undefined | XmlObject | XmlValue[];

interface XmlObject {
	[key: string]: XmlValue;
}

const escapeXml = (str: string | number | boolean): string => {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
};

const stringifyNode = (key: string, value: XmlValue, indent = ''): string => {
	// Handle null/undefined
	if (value === null || value === undefined) {
		return '';
	}

	// Handle arrays
	if (Array.isArray(value)) {
		return value.map(item => stringifyNode(key, item, indent)).join('\n');
	}

	// Handle primitives
	if (typeof value !== 'object') {
		return `${indent}<${key}>${escapeXml(value)}</${key}>`;
	}

	// Handle objects with attributes
	const attrs: string[] = [];
	const children: string[] = [];

	for (const [k, v] of Object.entries(value)) {
		if (k.startsWith('@')) {
			// Attribute
			const attrName = k.slice(1);
			attrs.push(`${attrName}="${escapeXml(v as string | number | boolean)}"`);
		} else {
			// Child element
			const childXml = stringifyNode(k, v, indent + '  ');
			if (childXml) {
				children.push(childXml);
			}
		}
	}

	const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

	if (children.length === 0) {
		return `${indent}<${key}${attrStr}/>`;
	}

	if (children.length === 1 && !children[0].includes('\n')) {
		// Single inline child
		return `${indent}<${key}${attrStr}>${children[0].trim()}</${key}>`;
	}

	// Multiple children or complex structure
	return `${indent}<${key}${attrStr}>\n${children.join('\n')}\n${indent}</${key}>`;
};

export const stringify = (obj: XmlObject): string => {
	const version = obj['@version'] || '1.0';
	const encoding = obj['@encoding'] || 'UTF-8';
	const xmlDeclaration = `<?xml version="${version}" encoding="${encoding}"?>`;

	// Remove declaration attributes from object
	const { '@version': _, '@encoding': __, ...rest } = obj;

	// Stringify the root element
	const rootKey = Object.keys(rest)[0];
	const rootValue = rest[rootKey];
	const rootXml = stringifyNode(rootKey, rootValue as XmlValue, '');

	return `${xmlDeclaration}\n${rootXml}`;
};
