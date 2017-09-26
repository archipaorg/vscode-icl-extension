/**
 * Returns only unique elements 
 * @param arr 
 * @param getComparisonField 
 */
export function unique<A, B>(arr: Array<A>, getComparisonField: (element: A) => B): Array<A> {
    let filtredArr: Array<A> = [];
    let uniqueFields: Array<B> = [];
    for (let elt of arr) {
        if (uniqueFields.indexOf(getComparisonField(elt)) === -1) {
            uniqueFields.push(getComparisonField(elt));
            filtredArr.push(elt);
        }
    }
    return filtredArr;
}