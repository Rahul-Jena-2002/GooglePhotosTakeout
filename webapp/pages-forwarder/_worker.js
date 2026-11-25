// Pages service binding preserves the original request URL and streams its body.
export default {
  fetch(request, env) {
    return env.WEBSITE.fetch(request);
  },
};
