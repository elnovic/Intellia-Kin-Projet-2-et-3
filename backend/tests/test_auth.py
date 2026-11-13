from tests.conftest import LEARNER


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_register_login_and_profile(client):
    created = client.post("/auth/register", json=LEARNER)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["email"] == LEARNER["email"]
    assert body["role"] == "learner"
    assert "password" not in body and "password_hash" not in body

    login = client.post(
        "/auth/login", json={"email": LEARNER["email"], "password": LEARNER["password"]}
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["full_name"] == LEARNER["full_name"]


def test_email_is_case_insensitive(client):
    client.post("/auth/register", json=LEARNER)
    duplicate = client.post(
        "/auth/register", json={**LEARNER, "email": LEARNER["email"].upper()}
    )
    assert duplicate.status_code == 409
    login = client.post(
        "/auth/login",
        json={"email": LEARNER["email"].upper(), "password": LEARNER["password"]},
    )
    assert login.status_code == 200


def test_phone_must_be_unique_and_international(client):
    first = client.post("/auth/register", json={**LEARNER, "phone": "+243828245747"})
    assert first.status_code == 201
    same_phone = client.post(
        "/auth/register",
        json={**LEARNER, "email": "autre@intelliakin.com", "phone": "+243828245747"},
    )
    assert same_phone.status_code == 409
    local_format = client.post(
        "/auth/register",
        json={**LEARNER, "email": "local@intelliakin.com", "phone": "0828245747"},
    )
    assert local_format.status_code == 422


def test_short_password_is_refused(client):
    response = client.post("/auth/register", json={**LEARNER, "password": "court"})
    assert response.status_code == 422


def test_wrong_password_and_unknown_account_get_the_same_answer(client):
    client.post("/auth/register", json=LEARNER)
    wrong = client.post(
        "/auth/login", json={"email": LEARNER["email"], "password": "mauvais-mot-de-passe"}
    )
    unknown = client.post(
        "/auth/login", json={"email": "inconnu@intelliakin.com", "password": "peu-importe"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_profile_requires_a_valid_token(client):
    assert client.get("/auth/me").status_code == 401
    forged = client.get("/auth/me", headers={"Authorization": "Bearer faux-jeton"})
    assert forged.status_code == 401
