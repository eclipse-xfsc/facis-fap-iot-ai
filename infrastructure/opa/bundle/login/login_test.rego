package facis.login

config := {
	"trusted_issuers": {"did:web:issuer.example.org": {"organisations": ["did:web:org-x.facis.cloud"]}},
	"clients": {"facis-ai-insight-ui": {"allowed_roles": ["administrator", "data_scientist", "data_analyst"]}},
}

base := {
	"roles": ["data_analyst"],
	"org_did": "did:web:org-x.facis.cloud",
	"issuer": "did:web:issuer.example.org",
	"client_id": "facis-ai-insight-ui",
}

decide(over) := d if {
	d := allow with input as object.union(base, over) with data.facis.login_config as config
}

# fixture 60
test_fixture_login_allow if {
	decide({}).allow == true
}

# fixture 61
test_fixture_login_deny_no_roles if {
	d := decide({"roles": []})
	d.allow == false
	d.reason == "no disclosed role is allowed for this application (provider defaults filtered)"
}

# fixture 62
test_fixture_login_deny_untrusted_issuer if {
	d := decide({"issuer": "did:web:someone-else.example.org"})
	d.allow == false
	d.reason == "credential issuer not trusted"
}

# fixture 63
test_fixture_login_deny_issuer_for_another_organisation if {
	d := decide({"org_did": "did:web:org-y.facis.cloud"})
	d.allow == false
	d.reason == "issuer does not vouch for this organisation"
}

# fixture 64
test_fixture_login_deny_role_not_allowed_for_application if {
	d := decide({"roles": ["operator"]})
	d.allow == false
}

test_login_deny_unknown_application if {
	d := decide({"client_id": "another-app"})
	d.allow == false
	d.reason == "unknown application"
}

test_login_deny_invalid_did if {
	decide({"org_did": "not a did"}).reason == "invalid or missing org_did"
}

# Provider-default roles are filtered: a token that also carries them passes
test_login_allow_with_provider_defaults if {
	decide({"roles": ["offline_access", "default-roles-facis", "data_scientist"]}).allow == true
}

test_login_deny_without_deployment_data if {
	d := allow with input as base with data.facis.login_config as {}
	d.allow == false
	d.reason == "credential issuer not trusted"
}
