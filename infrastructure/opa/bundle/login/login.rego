# login.rego — package login: the decision the guard's login provider asks
# for after a verified presentation, before it accepts the login.
# Query: POST /v1/data/facis/login/allow
#   {"input": {"org_did": ..., "roles": [...], "issuer": <credential issuer DID>,
#              "client_id": <OAuth2 client of the application>}}
# Decision object: {"allow": bool, "reason": str}. Callers read .result.allow.
# Deny by default. All of these must hold:
#   - the organisation DID is well formed;
#   - the credential's issuer is trusted and vouches for that organisation;
#   - the application is known, and at least one disclosed role is allowed
#     for it.
# Trusted issuers and applications are deployment data, not part of this
# bundle: data.facis.login_config (see the README, "Deployment data"). Without
# it, every login is refused.
package facis.login

default allow := {"allow": false, "reason": "deny by default"}

issuer_trusted(issuer) if {
	is_string(issuer)
	data.facis.login_config.trusted_issuers[issuer]
}

issuer_vouches(issuer, org) if {
	issuer_trusted(issuer)
	org in data.facis.login_config.trusted_issuers[issuer].organisations
}

client_known(client) if {
	is_string(client)
	data.facis.login_config.clients[client]
}

role_allowed(client, roles) if {
	client_known(client)
	some r in data.facis.common.effective_roles(roles)
	r in data.facis.login_config.clients[client].allowed_roles
}

allow := {"allow": true, "reason": "issuer vouches for the organisation, role allowed for the application"} if {
	data.facis.common.valid_did(input.org_did)
	issuer_vouches(input.issuer, input.org_did)
	role_allowed(input.client_id, input.roles)
} else := {"allow": false, "reason": "invalid or missing org_did"} if {
	not data.facis.common.valid_did(input.org_did)
} else := {"allow": false, "reason": "credential issuer not trusted"} if {
	not issuer_trusted(input.issuer)
} else := {"allow": false, "reason": "issuer does not vouch for this organisation"} if {
	not issuer_vouches(input.issuer, input.org_did)
} else := {"allow": false, "reason": "unknown application"} if {
	not client_known(input.client_id)
} else := {"allow": false, "reason": "no disclosed role is allowed for this application (provider defaults filtered)"}
