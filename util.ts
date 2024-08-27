export function containCnChar(text: string) {
    const pattern =
        /[\p{Unified_Ideograph}\u3006\u3007][\ufe00-\ufe0f\u{e0100}-\u{e01ef}]?/gmu;
    return pattern.test(text);
}

export function isClosedTagHtmlLikeText(params: string) {
    const text = params.trim();
    return /^<[a-z][\s\S]*>*<\/?[a-z][\s\S]*>$/i.test(text)
}
