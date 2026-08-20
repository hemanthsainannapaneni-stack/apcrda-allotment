import Cases from './Cases';

/** Applications are simply the cases still in Phase A (intake & eligibility). */
export default function Applications() {
  return <Cases lockPhase="A" />;
}
